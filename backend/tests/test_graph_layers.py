"""Wave 7d (STO-622): display-only architecture layers."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.fingerprint import diff_graphs, document_fingerprint, semantic_fingerprint
from app.main import app
from app.models import GraphLayer

client = TestClient(app)

LAYERS = [
    GraphLayer(id="ingress", label="Ingress", color="blue"),
    GraphLayer(id="reasoning", label="Reasoning"),
]


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _layered():
    graph = build_demo_graph()
    graph.layers = list(LAYERS)
    for node in graph.nodes:
        node.extensions = {
            **(node.extensions or {}),
            "layer": "ingress" if node.type == "input" else "reasoning",
        }
    return graph


def test_layers_round_trip() -> None:
    graph = _layered()
    assert (
        client.put(f"/api/graphs/{graph.id}", json=graph.model_dump(mode="json")).status_code == 200
    )
    loaded = client.get(f"/api/graphs/{graph.id}").json()
    assert loaded["layers"] == [layer.model_dump(mode="json") for layer in LAYERS]
    assert loaded["nodes"][0]["extensions"]["layer"] == "ingress"


def test_layers_and_node_layer_are_display_only() -> None:
    plain = build_demo_graph()
    layered = _layered()
    assert semantic_fingerprint(layered) == semantic_fingerprint(plain)
    assert document_fingerprint(layered) != document_fingerprint(plain)
    assert diff_graphs(plain, layered)["node_changes"] == []
    no_layers = build_demo_graph()
    no_layers.layers = []
    assert document_fingerprint(no_layers) == document_fingerprint(plain)


def test_unknown_layer_warns() -> None:
    graph = _layered()
    graph.nodes[1].extensions = {"layer": "tools"}
    diagnostics = [d for d in validate_graph(graph) if d.code == "LAYER_UNKNOWN"]
    assert [(d.node_id, d.blocking) for d in diagnostics] == [(graph.nodes[1].id, False)]
