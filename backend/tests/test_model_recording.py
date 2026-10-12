"""Model recording on traces and the profile-provider compile warning (model-selection Phase 2)."""

from __future__ import annotations

import pytest

from app import storage
from app.compiler import compile_graph
from app.demo_graph import build_demo_graph
from app.models import GraphEdge, GraphNode, NodePosition, NodeType
from app.providers.stub import StubChatModel
from app.runtime import COMPILED_WORKFLOWS, get_run_node_traces, get_run_summary, start_run_inline

_POS = NodePosition(x=0, y=0)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("AI_MODEL", raising=False)


def _profile(profile_id: str = "lp_fast", **extra: str) -> None:
    storage.save_resource(
        "llm_profiles",
        profile_id,
        {"id": profile_id, "name": "Fast", "model": "profile-m", **extra},
    )


def _graph(node_type: NodeType = NodeType.LLM, **llm_config: object):
    nodes = [
        GraphNode(
            id="input_1", type=NodeType.INPUT, position=_POS, config={"variableName": "question"}
        ),
        GraphNode(id="llm_1", type=node_type, position=_POS, config=dict(llm_config)),
        GraphNode(id="output_1", type=NodeType.OUTPUT, position=_POS, config={}),
    ]
    edges = [
        GraphEdge(id="e1", source="input_1", target="llm_1"),
        GraphEdge(id="e2", source="llm_1", target="output_1"),
    ]
    return build_demo_graph().model_copy(
        update={
            "id": "g_model",
            "name": "Model recording",
            "nodes": nodes,
            "edges": edges,
            "entry_node_id": "input_1",
        }
    )


async def _llm_trace_input(graph, **run_kwargs) -> dict:
    compiled = compile_graph(graph, f"cwf_{graph.id}")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS[f"cwf_{graph.id}"] = graph
    run_id, _bus = await start_run_inline(
        f"cwf_{graph.id}", {"question": "TCP"}, provider="stub", **run_kwargs
    )
    assert get_run_summary(run_id).status == "succeeded", get_run_summary(run_id).error
    return {t.node_id: t for t in get_run_node_traces(run_id)}["llm_1"].input


@pytest.mark.asyncio
async def test_pin_is_recorded_as_a_pin() -> None:
    recorded = await _llm_trace_input(_graph(model="pin-m"))
    assert (recorded["requestedModel"], recorded["modelSource"]) == ("pin-m", "pin")
    assert recorded["model"] == "pin-m"


@pytest.mark.asyncio
async def test_run_model_beats_the_pin_and_is_recorded_as_the_run() -> None:
    recorded = await _llm_trace_input(_graph(model="pin-m"), model="run-m")
    assert (recorded["requestedModel"], recorded["modelSource"]) == ("run-m", "run")


@pytest.mark.asyncio
async def test_bound_profile_beats_the_pin() -> None:
    _profile()
    recorded = await _llm_trace_input(_graph(model="pin-m", llmProfileId="lp_fast"))
    assert (recorded["requestedModel"], recorded["modelSource"]) == ("profile-m", "profile")


@pytest.mark.asyncio
@pytest.mark.parametrize("config", [{}, {"model": "qwen2.5:3b"}, {"model": "stub"}])
async def test_no_real_pin_is_recorded_as_the_provider_default(config: dict) -> None:
    recorded = await _llm_trace_input(_graph(**config))
    assert (recorded["requestedModel"], recorded["modelSource"]) == (None, "default")


@pytest.mark.asyncio
async def test_tool_loop_records_the_same_fields() -> None:
    graph = _graph(NodeType.TOOL_LOOP, model="pin-m", maxToolIterations=1)
    recorded = await _llm_trace_input(graph, model="run-m")
    assert (recorded["requestedModel"], recorded["modelSource"]) == ("run-m", "run")


@pytest.mark.asyncio
async def test_counterfactual_chat_model_is_recorded_as_an_override() -> None:
    recorded = await _llm_trace_input(
        _graph(model="pin-m"), node_chat_models={"llm_1": StubChatModel(model="swapped")}
    )
    assert (recorded["requestedModel"], recorded["modelSource"]) == (None, "override")
    assert recorded["model"] == "swapped"


def _codes(graph) -> list:
    result = compile_graph(graph, f"cwf_{graph.id}")
    assert result.ok, result.diagnostics
    return [d for d in result.diagnostics if d.code == "PROFILE_PROVIDER_IGNORED"]


@pytest.mark.parametrize("node_type", [NodeType.LLM, NodeType.TOOL_LOOP])
def test_profile_provider_on_a_node_is_flagged_but_does_not_block(node_type: NodeType) -> None:
    _profile(model_provider="groq")
    # tool_loop requires its own model and iteration cap.
    required = {"model": "pin-m", "maxToolIterations": 1} if node_type == NodeType.TOOL_LOOP else {}
    found = _codes(_graph(node_type, llmProfileId="lp_fast", **required))
    assert len(found) == 1
    diagnostic = found[0]
    assert diagnostic.severity == "warning"
    assert diagnostic.blocking is False
    assert diagnostic.node_id == "llm_1"
    assert "llmProfileId" in diagnostic.message and "groq" in diagnostic.message


def test_profile_without_a_provider_is_not_flagged() -> None:
    _profile()
    assert _codes(_graph(llmProfileId="lp_fast")) == []


def test_node_without_a_profile_is_not_flagged() -> None:
    _profile(model_provider="groq")
    assert _codes(_graph(model="pin-m")) == []
