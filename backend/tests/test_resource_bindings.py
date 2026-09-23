"""Wave 4a (studio-graph-workbench-redesign-plan.md, STO-605): node ↔
resource-registry bindings -- validation, execution, release freezing and
the reverse "used by" API.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.bindings import BINDING_FIELDS
from app.compiler import compile_graph, validate_graph
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import GraphEdge, GraphNode, NodePosition, NodeType
from app.releases import resolve_resource_snapshots
from app.runtime import COMPILED_WORKFLOWS, get_run_node_traces, get_run_summary, start_run_inline

client = TestClient(app)
_POS = NodePosition(x=0, y=0)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _seed() -> None:
    storage.save_resource(
        "prompts",
        "p_explain",
        {"id": "p_explain", "name": "Explain", "body": "Explain {question} simply"},
    )
    storage.save_resource(
        "prompts", "p_sys", {"id": "p_sys", "name": "Tutor", "body": "You are a patient tutor."}
    )
    storage.save_resource(
        "llm_profiles", "lp_fast", {"id": "lp_fast", "name": "Fast", "model": "profile-model"}
    )


def _bound_graph(graph_id: str = "g_bound", **overrides: dict) -> object:
    prompt_cfg = {
        "template": "INLINE {question}",
        "promptId": "p_explain",
        **overrides.get("prompt", {}),
    }
    llm_cfg = {
        "model": "inline-model",
        "llmProfileId": "lp_fast",
        "systemPromptId": "p_sys",
        **overrides.get("llm", {}),
    }
    nodes = [
        GraphNode(
            id="input_1", type=NodeType.INPUT, position=_POS, config={"variableName": "question"}
        ),
        GraphNode(id="prompt_1", type=NodeType.PROMPT, position=_POS, config=prompt_cfg),
        GraphNode(id="llm_1", type=NodeType.LLM, position=_POS, config=llm_cfg),
        GraphNode(id="output_1", type=NodeType.OUTPUT, position=_POS, config={}),
    ]
    edges = [
        GraphEdge(id="e1", source="input_1", target="prompt_1"),
        GraphEdge(id="e2", source="prompt_1", target="llm_1"),
        GraphEdge(id="e3", source="llm_1", target="output_1"),
    ]
    return build_demo_graph().model_copy(
        update={
            "id": graph_id,
            "name": "Bound graph",
            "nodes": nodes,
            "edges": edges,
            "entry_node_id": "input_1",
        }
    )


async def _run(graph, run_input: dict, **kwargs):
    compiled = compile_graph(graph, f"cwf_{graph.id}")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS[f"cwf_{graph.id}"] = graph
    run_id, _bus = await start_run_inline(f"cwf_{graph.id}", run_input, provider="stub", **kwargs)
    return get_run_summary(run_id), {t.node_id: t for t in get_run_node_traces(run_id)}


@pytest.mark.asyncio
async def test_bound_prompt_system_prompt_and_profile_are_applied() -> None:
    _seed()
    summary, traces = await _run(_bound_graph(), {"question": "TCP"})
    assert summary.status == "succeeded", summary.error
    assert traces["prompt_1"].output == "Explain TCP simply"
    llm_input = traces["llm_1"].input
    assert llm_input["systemPrompt"] == "You are a patient tutor."
    assert llm_input["model"] == "profile-model"


@pytest.mark.asyncio
async def test_run_level_model_override_still_wins_over_profile() -> None:
    _seed()
    _summary, traces = await _run(
        _bound_graph("g_override"), {"question": "TCP"}, model="run-model"
    )
    assert traces["llm_1"].input["model"] == "run-model"


def test_missing_binding_is_a_field_scoped_compile_error() -> None:
    _seed()
    graph = _bound_graph("g_missing", prompt={"promptId": "p_gone"})
    diagnostics = [d for d in validate_graph(graph) if d.code == "UNRESOLVED_RESOURCE_BINDING"]
    assert len(diagnostics) == 1
    assert diagnostics[0].blocking and diagnostics[0].node_id == "prompt_1"
    assert diagnostics[0].message == "prompt node 'prompt_1': promptId: prompts 'p_gone' not found"


def test_unbound_nodes_keep_inline_config() -> None:
    graph = _bound_graph(
        "g_inline", prompt={"promptId": ""}, llm={"llmProfileId": None, "systemPromptId": ""}
    )
    assert not [d for d in validate_graph(graph) if d.code == "UNRESOLVED_RESOURCE_BINDING"]
    snapshots, diagnostics = resolve_resource_snapshots(graph)
    assert snapshots == {} and diagnostics == []


@pytest.mark.asyncio
async def test_release_snapshot_freezes_bound_resources() -> None:
    _seed()
    graph = _bound_graph("g_release")
    snapshots, diagnostics = resolve_resource_snapshots(graph)
    assert diagnostics == []
    assert {"prompts:p_explain", "prompts:p_sys", "llm_profiles:lp_fast"} <= snapshots.keys()

    # A later edit changes draft runs but not the frozen release.
    storage.save_resource(
        "prompts", "p_explain", {"id": "p_explain", "name": "Explain", "body": "EDITED {question}"}
    )
    _s, draft = await _run(graph, {"question": "TCP"})
    assert draft["prompt_1"].output == "EDITED TCP"
    _s, released = await _run(graph, {"question": "TCP"}, release_resource_snapshots=snapshots)
    assert released["prompt_1"].output == "Explain TCP simply"


def test_unresolved_binding_blocks_release() -> None:
    graph = _bound_graph("g_unresolved")
    _snapshots, diagnostics = resolve_resource_snapshots(graph)
    codes = {d.code for d in diagnostics}
    assert codes == {"RELEASE_RESOURCE_UNRESOLVED"} and all(d.blocking for d in diagnostics)
    assert len(diagnostics) == 3


def test_usages_api_lists_bound_nodes_and_mcp_via_tools() -> None:
    _seed()
    storage.save_graph(_bound_graph("g_usage"))
    storage.save_resource(
        "mcp_servers", "mcp_1", {"id": "mcp_1", "name": "S", "url": "https://x.example"}
    )
    storage.save_resource(
        "tools", "t_1", {"id": "t_1", "description": "d", "mcp_server_id": "mcp_1"}
    )
    tool_graph = build_demo_graph().model_copy(
        update={
            "id": "g_tool",
            "name": "Tool graph",
            "nodes": [
                *build_demo_graph().nodes,
                GraphNode(
                    id="tool_x", type=NodeType.TOOL, position=_POS, config={"toolName": "t_1"}
                ),
            ],
        }
    )
    storage.save_graph(tool_graph)

    prompt_usages = client.get("/api/prompts/p_sys/usages").json()
    assert prompt_usages == [
        {
            "graph_id": "g_usage",
            "graph_name": "Bound graph",
            "node_id": "llm_1",
            "node_type": "llm",
            "field": "systemPromptId",
            "via": None,
        }
    ]
    assert [u["node_id"] for u in client.get("/api/llm-profiles/lp_fast/usages").json()] == [
        "llm_1"
    ]
    assert [(u["node_id"], u["via"]) for u in client.get("/api/tools/t_1/usages").json()] == [
        ("tool_x", None)
    ]
    assert [
        (u["node_id"], u["via"]) for u in client.get("/api/mcp-servers/mcp_1/usages").json()
    ] == [("tool_x", "tools:t_1")]
    assert client.get("/api/prompts/nobody/usages").json() == []


def test_binding_fields_match_the_sdk_mirror() -> None:
    """Cross-language contract: packages/agent-graph-sdk/src/bindings.ts."""
    fixture = (
        Path(__file__).resolve().parents[2] / "packages/agent-graph-sdk/contract/node-bindings.json"
    )
    sdk = json.loads(fixture.read_text())
    assert sdk == {
        node_type: [list(pair) for pair in pairs] for node_type, pairs in BINDING_FIELDS.items()
    }
