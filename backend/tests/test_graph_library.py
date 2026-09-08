"""Graph library API and template tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.graph_templates import build_blank_graph, build_graph_from_demo_template, create_graph_definition
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "graphs.db"
    monkeypatch.setattr(storage, "DB_PATH", db_path)
    return TestClient(app)


def test_blank_template_has_input_and_output() -> None:
    graph = build_blank_graph("graph_test", "My blank")
    node_types = {node.type.value for node in graph.nodes}
    assert node_types == {"input", "output"}
    assert graph.entry_node_id == "input_1"
    assert len(graph.edges) == 1


def test_demo_template_copies_demo_topology() -> None:
    graph = build_graph_from_demo_template("graph_copy", "Copy")
    assert len(graph.nodes) == 8
    assert any(node.type.value == "router" for node in graph.nodes)


def test_create_graph_definition_generates_unique_ids() -> None:
    first = create_graph_definition("One", "blank")
    second = create_graph_definition("Two", "blank")
    assert first.id != second.id
    assert first.id.startswith("graph_")


def test_post_graphs_creates_blank(client: TestClient) -> None:
    response = client.post("/api/graphs", json={"name": "Fresh graph", "template": "blank"})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Fresh graph"
    assert body["id"].startswith("graph_")

    listed = client.get("/api/graphs").json()
    assert any(item["id"] == body["id"] for item in listed)


def test_post_graphs_creates_from_demo_template(client: TestClient) -> None:
    response = client.post("/api/graphs", json={"name": "Demo copy", "template": "demo"})
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Demo copy"
    assert len(body["nodes"]) == 8
