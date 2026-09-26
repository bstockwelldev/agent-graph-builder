"""The Transforms library: reusable transforms bound by id from edges
(`transform.transform_id`), resolved for validation and execution, pinned
into release snapshots, and listed in the usages API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import EdgeTransform, GraphEdge, GraphNode, NodePosition, NodeType
from app.node_configs import validate_node_config
from app.ports import default_output_port
from app.releases import resolve_resource_snapshots
from app.runtime import COMPILED_WORKFLOWS, get_run_node_traces, get_run_summary, start_run_inline

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


FACT_LINE = {
    "id": "fact_line",
    "name": "Fact line",
    "type": "format_message",
    "template": "Fact: {value}",
}


def _graph_with_ref(graph_id: str = "g_lib", ref: str = "fact_line"):
    graph = build_demo_graph().model_copy(update={"id": graph_id})
    edges = [
        edge.model_copy(update={"transform": EdgeTransform(transform_id=ref)})
        if edge.id == "e_tool_output"
        else edge
        for edge in graph.edges
    ]
    return graph.model_copy(update={"edges": edges})


async def _run(graph, **kwargs):
    COMPILED_WORKFLOWS[f"cwf_{graph.id}"] = graph
    run_id, _bus = await start_run_inline(
        f"cwf_{graph.id}",
        {"question": "How does a database index work?"},
        provider="stub",
        **kwargs,
    )
    return get_run_summary(run_id), {t.node_id: t for t in get_run_node_traces(run_id)}


def test_crud_validates_the_transform() -> None:
    assert client.post("/api/transforms", json=FACT_LINE).status_code in (200, 201)
    assert client.get("/api/transforms/fact_line").json()["template"] == "Fact: {value}"
    incomplete = {"id": "bad", "name": "Bad", "type": "select"}
    assert client.post("/api/transforms", json=incomplete).status_code == 422


def test_edge_transform_needs_a_type_or_a_reference() -> None:
    with pytest.raises(ValueError, match="type or a transform_id"):
        EdgeTransform()


def test_reference_validates_as_the_library_transform() -> None:
    storage.save_resource("transforms", "fact_line", FACT_LINE)
    diagnostics = validate_graph(_graph_with_ref())
    assert not [d for d in diagnostics if d.edge_id == "e_tool_output"], diagnostics


def test_missing_reference_is_an_edge_scoped_error() -> None:
    diagnostics = [
        d
        for d in validate_graph(_graph_with_ref(ref="gone"))
        if d.code == "UNRESOLVED_RESOURCE_BINDING"
    ]
    assert len(diagnostics) == 1
    assert diagnostics[0].edge_id == "e_tool_output" and diagnostics[0].blocking


@pytest.mark.asyncio
async def test_release_pins_the_library_transform() -> None:
    storage.save_resource("transforms", "fact_line", FACT_LINE)
    graph = _graph_with_ref("g_release")
    snapshots, diagnostics = resolve_resource_snapshots(graph)
    assert diagnostics == [] and "transforms:fact_line" in snapshots

    storage.save_resource("transforms", "fact_line", {**FACT_LINE, "template": "EDITED: {value}"})
    draft, _ = await _run(graph)
    assert draft.status == "succeeded" and draft.result.startswith("EDITED: ")
    released, _ = await _run(graph, release_resource_snapshots=snapshots)
    assert released.status == "succeeded" and released.result.startswith("Fact: ")


@pytest.mark.asyncio
async def test_unresolved_reference_fails_the_edge_at_runtime() -> None:
    summary, traces = await _run(_graph_with_ref("g_gone", ref="gone"))
    assert summary.status == "failed"
    assert "library transform 'gone' not found" in (summary.error or "")
    assert traces["output_1"].status == "failed"


def test_unresolved_reference_blocks_release() -> None:
    _snapshots, diagnostics = resolve_resource_snapshots(_graph_with_ref("g_block", ref="gone"))
    assert [(d.code, d.edge_id) for d in diagnostics] == [
        ("RELEASE_RESOURCE_UNRESOLVED", "e_tool_output")
    ]


def test_usages_list_referencing_edges() -> None:
    storage.save_resource("transforms", "fact_line", FACT_LINE)
    storage.save_graph(_graph_with_ref("g_usage"))
    usages = client.get("/api/transforms/fact_line/usages").json()
    assert [(u["graph_id"], u["node_id"], u["node_type"], u["field"]) for u in usages] == [
        ("g_usage", "e_tool_output", "edge", "transform")
    ]


# --- transform node -------------------------------------------------------


def _graph_with_transform_node(config: dict, graph_id: str = "g_node"):
    """Demo graph with a transform node spliced in between lookup_topic and output."""
    graph = build_demo_graph().model_copy(update={"id": graph_id})
    node = GraphNode(
        id="shape_1", type=NodeType.TRANSFORM, position=NodePosition(x=0, y=0), config=config
    )
    edges = [
        edge.model_copy(update={"target": "shape_1"}) if edge.id == "e_tool_output" else edge
        for edge in graph.edges
    ]
    edges.append(GraphEdge(id="e_shape_output", source="shape_1", target="output_1"))
    return graph.model_copy(update={"nodes": [*graph.nodes, node], "edges": edges})


def test_transform_node_config_needs_a_complete_transform_or_a_binding() -> None:
    assert validate_node_config(NodeType.TRANSFORM, {"type": "wrap", "field": "topic"}) == []
    assert validate_node_config(NodeType.TRANSFORM, {"transformId": "fact_line"}) == []
    assert validate_node_config(NodeType.TRANSFORM, {"type": "select"}) == [
        "config: Value error, select transform requires 'pointer'"
    ]
    assert validate_node_config(NodeType.TRANSFORM, {})


def test_transform_node_output_kind_follows_its_type() -> None:
    def kind(config: dict) -> str:
        node = GraphNode(id="t", type=NodeType.TRANSFORM, config=config)
        return default_output_port(node).contract.kind.value

    assert kind({"type": "format_message", "template": "{value}"}) == "message"
    assert kind({"type": "coerce", "targetType": "string"}) == "message"
    assert kind({"type": "select", "pointer": "/a"}) == "structured-json"


def test_demo_graph_with_transform_node_validates_clean() -> None:
    graph = _graph_with_transform_node({"type": "format_message", "template": "Fact: {value}"})
    assert [
        d for d in validate_graph(graph) if d.node_id == "shape_1" or d.edge_id == "e_shape_output"
    ] == []


@pytest.mark.asyncio
async def test_transform_node_runs_inline() -> None:
    summary, traces = await _run(
        _graph_with_transform_node({"type": "wrap", "field": "fact"}, "g_inline")
    )
    assert summary.status == "succeeded", summary.error
    assert isinstance(summary.result, dict) and list(summary.result) == ["fact"]
    assert traces["shape_1"].input["transform"] == "wrap"


@pytest.mark.asyncio
async def test_transform_node_bound_to_library_is_pinned_by_release() -> None:
    storage.save_resource("transforms", "fact_line", FACT_LINE)
    graph = _graph_with_transform_node({"transformId": "fact_line"}, "g_bound_node")
    assert [d for d in validate_graph(graph) if d.node_id == "shape_1"] == []
    snapshots, diagnostics = resolve_resource_snapshots(graph)
    assert diagnostics == [] and "transforms:fact_line" in snapshots

    storage.save_resource("transforms", "fact_line", {**FACT_LINE, "template": "EDITED: {value}"})
    draft, _ = await _run(graph)
    assert draft.result.startswith("EDITED: ")
    released, _ = await _run(graph, release_resource_snapshots=snapshots)
    assert released.result.startswith("Fact: ")
    storage.save_graph(graph)
    usages = client.get("/api/transforms/fact_line/usages").json()
    assert [(u["node_id"], u["node_type"], u["field"]) for u in usages] == [
        ("shape_1", "transform", "transformId")
    ]


# --- preview ("Try it") -------------------------------------------------------


def test_preview_applies_an_inline_transform() -> None:
    body = {"transform": {"type": "select", "pointer": "/topic"}, "value": {"topic": "indexes"}}
    assert client.post("/api/transforms/preview", json=body).json() == {
        "ok": True,
        "output": "indexes",
        "error": None,
    }


def test_preview_reports_the_error_a_run_would_fail_with() -> None:
    body = {"transform": {"type": "coerce", "target_type": "number"}, "value": "abc"}
    response = client.post("/api/transforms/preview", json=body)
    assert response.status_code == 200
    assert response.json() == {"ok": False, "output": None, "error": "'abc' is not a number"}
    incomplete = {"transform": {"type": "wrap"}, "value": 1}
    assert client.post("/api/transforms/preview", json=incomplete).json()["error"] == (
        "wrap transform requires 'field'"
    )


def test_preview_resolves_a_library_reference() -> None:
    storage.save_resource("transforms", "fact_line", FACT_LINE)
    body = {"transform": {"transform_id": "fact_line"}, "value": "indexes speed up reads"}
    assert client.post("/api/transforms/preview", json=body).json()["output"] == (
        "Fact: indexes speed up reads"
    )
    missing = {"transform": {"transform_id": "gone"}, "value": 1}
    assert client.post("/api/transforms/preview", json=missing).json()["error"] == (
        "library transform 'gone' not found"
    )
