"""validate_graph flags duplicate node and edge ids as blocking structure
errors, one diagnostic per duplicated id."""

from __future__ import annotations

import pytest

from app.compiler import compile_graph, validate_graph
from app.demo_graph import build_demo_graph

DUPLICATE_CODES = {"GRAPH_DUPLICATE_NODE_ID", "GRAPH_DUPLICATE_EDGE_ID"}


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _duplicate_diagnostics(diagnostics):
    return [d for d in diagnostics if d.code in DUPLICATE_CODES]


def test_duplicate_node_ids_are_blocking_and_fail_compile() -> None:
    graph = build_demo_graph()
    copy = graph.nodes[-1]
    graph.nodes.extend([copy.model_copy(), copy.model_copy()])

    result = compile_graph(graph, "wf-1")

    duplicates = _duplicate_diagnostics(result.diagnostics)
    assert len(duplicates) == 1
    [diagnostic] = duplicates
    assert diagnostic.code == "GRAPH_DUPLICATE_NODE_ID"
    assert diagnostic.node_id == copy.id
    assert diagnostic.blocking is True
    assert diagnostic.severity == "error"
    assert "3" in diagnostic.message
    assert result.ok is False
    assert result.compiled_workflow_id is None


def test_duplicate_edge_ids_are_blocking() -> None:
    graph = build_demo_graph()
    copy = graph.edges[0]
    graph.edges.append(copy.model_copy())

    duplicates = _duplicate_diagnostics(validate_graph(graph))

    assert len(duplicates) == 1
    [diagnostic] = duplicates
    assert diagnostic.code == "GRAPH_DUPLICATE_EDGE_ID"
    assert diagnostic.edge_id == copy.id
    assert diagnostic.blocking is True
    assert compile_graph(graph, "wf-1").ok is False


def test_unique_ids_get_no_duplicate_diagnostics() -> None:
    graph = build_demo_graph()

    assert _duplicate_diagnostics(validate_graph(graph)) == []
    assert compile_graph(graph, "wf-1").ok is True
