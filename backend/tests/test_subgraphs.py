"""Wave 7c (STO-612): graph-as-node subgraphs."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import runtime, storage
from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import EdgeKind, GraphDefinition, GraphEdge, GraphNode, NodePosition, NodeType
from app.node_configs import validate_node_config
from app.releases import ReleasePublishBlocked, publish_release
from app.replay import replay_run
from app.subgraphs import MAX_DEPTH, extract_subgraph

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _node(node_id: str, node_type: NodeType, **config) -> GraphNode:
    return GraphNode(id=node_id, type=node_type, position=NodePosition(x=0, y=0), config=config)


def _chain(graph_id: str, *middle: GraphNode, variable: str = "question") -> GraphDefinition:
    nodes = [
        _node("in", NodeType.INPUT, variableName=variable),
        *middle,
        _node("out", NodeType.OUTPUT),
    ]
    edges = [
        GraphEdge(id=f"e{i}", source=a.id, target=b.id, kind=EdgeKind.SEQUENCE)
        for i, (a, b) in enumerate(zip(nodes, nodes[1:], strict=False))
    ]
    return GraphDefinition(
        id=graph_id, name=graph_id.title(), entry_node_id="in", nodes=nodes, edges=edges
    )


def _child(template: str = "Child says: {topic}") -> GraphDefinition:
    child = _chain("child", _node("p", NodeType.PROMPT, template=template), variable="topic")
    storage.save_graph(child)
    return child


def _parent(**config) -> GraphDefinition:
    return _chain("parent", _node("sub", NodeType.SUBGRAPH, graphId="child", **config))


def _codes(graph: GraphDefinition) -> dict[str, bool]:
    return {d.code: d.blocking for d in validate_graph(graph) if d.code.startswith("SUBGRAPH")}


async def _run(graph: GraphDefinition, question: str = "indexes", **kwargs):
    compiled = runtime.compile_workflow(graph)
    assert compiled.ok, compiled.diagnostics
    run_id, _ = await runtime.start_run_inline(
        compiled.compiled_workflow_id, {"question": question}, provider="stub", **kwargs
    )
    return runtime.RUN_STORE[run_id]


def _trace(run_id: str, node_id: str):
    return next(t for t in runtime.RUN_TRACES[run_id].values() if t.node_id == node_id)


# ------------------------------------------------------------ config + compile


def test_config_requires_graph_id() -> None:
    assert validate_node_config(NodeType.SUBGRAPH, {"graphId": "x"}) == []
    assert validate_node_config(NodeType.SUBGRAPH, {})


def test_valid_reference_has_no_subgraph_diagnostics() -> None:
    _child()
    assert _codes(_parent()) == {}


def test_missing_target_and_missing_version_block() -> None:
    assert _codes(_chain("p", _node("sub", NodeType.SUBGRAPH, graphId="nope"))) == {
        "SUBGRAPH_TARGET_MISSING": True
    }
    _child()
    assert _codes(_parent(version="rel_missing")) == {"SUBGRAPH_VERSION_MISSING": True}


def test_unknown_mapping_key_warns() -> None:
    _child()
    assert _codes(_parent(inputMapping={"nope": "{question}"})) == {"SUBGRAPH_INPUT_UNKNOWN": False}


def test_self_and_cross_graph_cycles_block() -> None:
    storage.save_graph(_chain("parent", _node("x", NodeType.PROMPT, template="x")))
    assert _codes(_chain("parent", _node("sub", NodeType.SUBGRAPH, graphId="parent"))) == {
        "SUBGRAPH_CYCLE": True
    }
    storage.save_graph(_chain("child", _node("back", NodeType.SUBGRAPH, graphId="parent")))
    assert _codes(_parent())["SUBGRAPH_CYCLE"] is True


def test_nesting_past_max_depth_blocks() -> None:
    storage.save_graph(_chain("g0", _node("p", NodeType.PROMPT, template="leaf")))
    for i in range(1, MAX_DEPTH + 1):
        storage.save_graph(_chain(f"g{i}", _node("sub", NodeType.SUBGRAPH, graphId=f"g{i - 1}")))
    ok = _chain("top", _node("sub", NodeType.SUBGRAPH, graphId=f"g{MAX_DEPTH - 1}"))
    too_deep = _chain("top", _node("sub", NodeType.SUBGRAPH, graphId=f"g{MAX_DEPTH}"))
    assert _codes(ok) == {}
    assert _codes(too_deep) == {"SUBGRAPH_DEPTH": True}


# ------------------------------------------------------------ nested runs


@pytest.mark.asyncio
async def test_nested_run_feeds_upstream_to_first_input_by_default() -> None:
    _child()
    summary = await _run(_parent())
    assert summary.status == "succeeded", summary.error
    assert summary.result == "Child says: indexes"
    trace = _trace(summary.run_id, "sub")
    child = runtime.RUN_STORE[trace.input["childRunId"]]
    assert (child.parent_run_id, child.parent_node_id) == (summary.run_id, "sub")
    assert trace.input["childInput"] == {"topic": "indexes"}
    assert trace.input["releaseId"] is None  # no child release yet -> saved draft
    assert any(e.event_type == "subgraph.completed" for e in summary.events)


@pytest.mark.asyncio
async def test_input_mapping_renders_templates() -> None:
    _child()
    summary = await _run(_parent(inputMapping={"topic": "B-trees vs {question}"}))
    assert summary.result == "Child says: B-trees vs indexes"


@pytest.mark.asyncio
async def test_failing_child_fails_the_node() -> None:
    child = _child()
    child.nodes.append(_node("gate", NodeType.HUMAN_GATE, content="approve?"))
    child.edges = [e for e in child.edges if e.target != "out"] + [
        GraphEdge(id="eg", source="p", target="gate"),
        GraphEdge(id="eo", source="gate", target="out"),
    ]
    storage.save_graph(child)  # the child pauses, so the node can't produce a result
    summary = await _run(_parent())
    assert summary.status == "failed"
    assert "child run" in (summary.error or "") and "paused" in (summary.error or "")


@pytest.mark.asyncio
async def test_depth_guard_refuses_at_runtime() -> None:
    _child()
    parent = _parent()
    compiled = runtime.compile_workflow(parent)
    run_id, _ = await runtime.start_run_inline(
        compiled.compiled_workflow_id, {"question": "q"}, provider="stub", depth=MAX_DEPTH
    )
    assert "nesting exceeds" in (runtime.RUN_STORE[run_id].error or "")


@pytest.mark.asyncio
async def test_replay_does_not_rerun_the_child() -> None:
    _child()
    summary = await _run(_parent())
    children_before = sum(1 for s in runtime.RUN_STORE.values() if s.parent_node_id == "sub")
    replayed = await replay_run(summary.run_id)
    assert replayed.run.result == summary.result
    assert sum(1 for s in runtime.RUN_STORE.values() if s.parent_node_id == "sub") == (
        children_before
    )


# ------------------------------------------------------------ releases


def test_publish_blocks_until_the_child_is_published() -> None:
    child = _child()
    parent = _parent()
    storage.save_graph(parent)
    with pytest.raises(ReleasePublishBlocked) as blocked:
        publish_release(parent)
    assert [d.code for d in blocked.value.diagnostics if d.blocking] == [
        "RELEASE_SUBGRAPH_UNPUBLISHED"
    ]
    with pytest.raises(ReleasePublishBlocked):
        publish_release(_parent(version="draft"))
    child_release, _ = publish_release(child)
    release, _ = publish_release(parent)
    assert release.resource_snapshots["subgraph:sub"] == {
        "graph_id": "child",
        "release_id": child_release.id,
    }


@pytest.mark.asyncio
async def test_release_run_uses_the_frozen_child() -> None:
    child = _child("v1: {topic}")
    publish_release(child)
    parent = _parent()
    release, _ = publish_release(parent)

    child_v2 = _child("v2: {topic}")
    publish_release(child_v2)
    assert (await _run(parent)).result == "v2: indexes"  # draft run: latest release

    frozen = await _run(
        release.graph, release_resource_snapshots=release.resource_snapshots, release_id=release.id
    )
    assert frozen.result == "v1: indexes"
    assert child.id == "child"


# ------------------------------------------------------------ extract + used-by


def test_extract_answer_branch_from_demo() -> None:
    demo = build_demo_graph()
    child, parent = extract_subgraph(demo, ["prompt_answer", "llm_answer"], "Answer branch")
    assert child.name == "Answer branch"
    assert [n.type for n in child.nodes][0] == NodeType.INPUT
    assert child.nodes[0].config == {"variableName": "question"}
    assert {(e.source, e.target) for e in child.edges} >= {
        ("input_1", "prompt_answer"),
        ("prompt_answer", "llm_answer"),
        ("llm_answer", "output_1"),
    }
    sub = next(n for n in parent.nodes if n.type == NodeType.SUBGRAPH)
    assert sub.config == {
        "graphId": child.id,
        "version": "latest",
        "inputMapping": {"question": "{question}"},
    }
    assert {n.id for n in parent.nodes}.isdisjoint({"prompt_answer", "llm_answer"})
    into = next(e for e in parent.edges if e.target == sub.id)
    assert (into.source, into.kind) == ("router_1", EdgeKind.DEFAULT)
    assert any(e.source == sub.id and e.target == "output_1" for e in parent.edges)


@pytest.mark.parametrize(
    ("node_ids", "reason"),
    [
        (["prompt_classify", "prompt_answer"], "connected"),
        (["router_1", "tool_lookup"], "exactly one outgoing"),
        (["input_1", "prompt_classify"], "Input and output"),
    ],
)
def test_extract_rejects_bad_selections(node_ids, reason) -> None:
    with pytest.raises(ValueError, match=reason):
        extract_subgraph(build_demo_graph(), node_ids, "x")


@pytest.mark.asyncio
async def test_extract_route_saves_child_and_parent_run_matches() -> None:
    demo = build_demo_graph()
    storage.save_graph(demo)
    # A non-technical question routes into the extracted answer branch.
    original = await _run(demo, "write a poem about the sea")
    body = {
        "draft": demo.model_dump(mode="json"),
        "node_ids": ["prompt_answer", "llm_answer"],
        "name": "Answer branch",
    }
    response = client.post(f"/api/graphs/{demo.id}/extract-subgraph", json=body)
    assert response.status_code == 200, response.text
    payload = response.json()
    child_id = payload["child_graph"]["id"]
    assert storage.get_graph(child_id) is not None
    parent = GraphDefinition.model_validate(payload["proposed_parent"])
    storage.save_graph(parent)
    rerun = await _run(parent, "write a poem about the sea")
    assert rerun.status == "succeeded", rerun.error
    assert rerun.result == original.result
    assert _trace(rerun.run_id, "subgraph_1").input["childRunId"]

    used_by = client.get(f"/api/graphs/{child_id}/used-by").json()
    assert used_by == [{"graph_id": demo.id, "name": demo.name, "node_ids": ["subgraph_1"]}]
    bad = {**body, "node_ids": ["prompt_classify", "prompt_answer"]}
    assert client.post(f"/api/graphs/{demo.id}/extract-subgraph", json=bad).status_code == 422
