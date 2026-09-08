"""Validate-only endpoint and edge diagnostic metadata."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import runtime
from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import EdgeKind, GraphEdge

client = TestClient(app)


def test_edge_diagnostics_include_edge_id() -> None:
    graph = build_demo_graph()
    broken = graph.model_copy(
        update={
            "edges": [
                GraphEdge(
                    id="e_missing_condition",
                    source="router_1",
                    target="tool_lookup",
                    kind=EdgeKind.CONDITIONAL,
                    condition=None,
                ),
                *graph.edges,
            ]
        }
    )
    diagnostics = validate_graph(broken)
    edge_diag = next(d for d in diagnostics if d.code == "GRAPH_CONDITIONAL_EDGE_MISSING_CONDITION")
    assert edge_diag.edge_id == "e_missing_condition"
    assert edge_diag.node_id == "router_1"


def test_validate_endpoint_does_not_register_compiled_workflow() -> None:
    graph = build_demo_graph()
    before = len(runtime.COMPILED_WORKFLOWS)

    response = client.post("/api/graphs/validate", json=graph.model_dump())

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["compiled_workflow_id"] is None
    assert len(runtime.COMPILED_WORKFLOWS) == before


def test_validate_endpoint_returns_blocking_result_for_cycle() -> None:
    graph = build_demo_graph()
    cyclic = graph.model_copy(
        update={
            "edges": [
                *graph.edges,
                GraphEdge(
                    id="e_cycle",
                    source="output_1",
                    target="input_1",
                    kind=EdgeKind.SEQUENCE,
                ),
            ]
        }
    )

    response = client.post("/api/graphs/validate", json=cyclic.model_dump())

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert any(d["code"] == "GRAPH_INVALID_CYCLE" for d in payload["diagnostics"])
