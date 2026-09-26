"""Wave 7b (STO-611): display-only visual groups."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.fingerprint import document_fingerprint, semantic_fingerprint
from app.main import app
from app.models import GraphDefinition, GraphGroup

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _grouped(*groups: GraphGroup) -> GraphDefinition:
    graph = build_demo_graph()
    graph.groups = list(groups)
    return graph


def _codes(graph: GraphDefinition) -> list[str]:
    return [d.code for d in validate_graph(graph) if d.code.startswith("GROUP_")]


def test_groups_round_trip_through_the_api() -> None:
    graph = _grouped(
        GraphGroup(
            id="grp_1", label="Answer", color="violet", node_ids=["prompt_answer", "llm_answer"]
        ),
        GraphGroup(id="grp_2", label="Lookup", node_ids=["tool_lookup"], collapsed=True),
    ).model_copy(update={"id": "demo_copy"})
    saved = client.put(f"/api/graphs/{graph.id}", json=graph.model_dump(mode="json"))
    assert saved.status_code == 200, saved.text
    loaded = client.get(f"/api/graphs/{graph.id}").json()
    assert loaded["groups"] == [g.model_dump(mode="json") for g in graph.groups or []]


def test_valid_groups_have_no_group_diagnostics() -> None:
    graph = _grouped(GraphGroup(id="g", label="A", node_ids=["prompt_answer", "llm_answer"]))
    assert _codes(graph) == []


def test_unknown_node_and_overlap_are_warnings() -> None:
    graph = _grouped(
        GraphGroup(id="g1", label="A", node_ids=["llm_answer", "ghost"]),
        GraphGroup(id="g2", label="B", node_ids=["llm_answer"]),
    )
    diagnostics = [d for d in validate_graph(graph) if d.code.startswith("GROUP_")]
    assert sorted(d.code for d in diagnostics) == ["GROUP_OVERLAP", "GROUP_UNKNOWN_NODE"]
    assert all(not d.blocking and d.severity == "warning" for d in diagnostics)
    assert next(d for d in diagnostics if d.code == "GROUP_OVERLAP").node_id == "llm_answer"


def test_groups_are_display_only_for_fingerprints() -> None:
    plain = build_demo_graph()
    grouped = _grouped(GraphGroup(id="g", label="A", node_ids=["llm_answer"], collapsed=True))
    assert semantic_fingerprint(grouped) == semantic_fingerprint(plain)
    assert document_fingerprint(grouped) != document_fingerprint(plain)
    assert document_fingerprint(_grouped()) == document_fingerprint(plain)
