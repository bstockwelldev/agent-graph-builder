"""P1 rollout plan, Slice A: semantic release comparison — categorized
behavior-level diffs between two GraphReleases, and the compare API route."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.demo_graph import build_demo_graph
from app.fingerprint import diff_graphs
from app.main import app
from app.releases import compare_releases, publish_release

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def test_diff_graphs_is_empty_for_identical_graphs() -> None:
    graph = build_demo_graph()
    deltas = diff_graphs(graph, graph.model_copy())
    assert deltas == {"node_changes": [], "edge_changes": [], "resource_changes": []}


def test_diff_graphs_reports_one_modified_node_for_one_config_change() -> None:
    graph = build_demo_graph()
    changed = graph.model_copy(
        update={
            "nodes": [
                n.model_copy(update={"config": {**n.config, "extra": "x"}})
                if n.id == "input_1"
                else n
                for n in graph.nodes
            ]
        }
    )
    original_config = next(n.config for n in graph.nodes if n.id == "input_1")
    deltas = diff_graphs(graph, changed)
    assert deltas["edge_changes"] == []
    assert len(deltas["node_changes"]) == 1
    change = deltas["node_changes"][0]
    assert change["id"] == "input_1"
    assert change["change"] == "modified"
    assert change["fields"]["config"] == {
        "from": original_config,
        "to": {**original_config, "extra": "x"},
    }


def test_diff_graphs_is_position_invariant() -> None:
    """Moving a node must not appear in a semantic release diff — the same
    reproducibility guarantee fingerprint.py's semantic_fingerprint gives."""
    from app.models import NodePosition

    graph = build_demo_graph()
    moved = graph.model_copy(
        update={
            "nodes": [
                n.model_copy(
                    update={"position": NodePosition(x=n.position.x + 500, y=n.position.y)}
                )
                for n in graph.nodes
            ]
        }
    )
    deltas = diff_graphs(graph, moved)
    assert deltas == {"node_changes": [], "edge_changes": [], "resource_changes": []}


def test_diff_graphs_reports_added_and_removed_nodes() -> None:
    from app.models import GraphNode, NodePosition, NodeType

    graph = build_demo_graph()
    extra_node = GraphNode(
        id="extra", type=NodeType.PROMPT, position=NodePosition(x=0, y=0), config={}
    )
    added = graph.model_copy(update={"nodes": [*graph.nodes, extra_node]})

    forward = diff_graphs(graph, added)
    assert forward["node_changes"] == [{"id": "extra", "change": "added", "fields": {}}]

    backward = diff_graphs(added, graph)
    assert backward["node_changes"] == [{"id": "extra", "change": "removed", "fields": {}}]


def test_diff_graphs_reports_edge_condition_change() -> None:
    graph = build_demo_graph()
    edge = graph.edges[0]
    changed = graph.model_copy(
        update={"edges": [edge.model_copy(update={"condition": "something-new"}), *graph.edges[1:]]}
    )
    deltas = diff_graphs(graph, changed)
    assert deltas["node_changes"] == []
    assert deltas["edge_changes"] == [
        {
            "id": edge.id,
            "change": "modified",
            "fields": {"condition": {"from": edge.condition, "to": "something-new"}},
        }
    ]


def test_diff_graphs_reports_resource_snapshot_changes() -> None:
    graph = build_demo_graph()
    before = {"tools:t1": {"id": "t1", "description": "old"}}
    after = {"tools:t1": {"id": "t1", "description": "new"}}
    deltas = diff_graphs(graph, graph.model_copy(), before, after)
    assert deltas["resource_changes"] == [
        {
            "id": "tools:t1",
            "change": "modified",
            "fields": {"description": {"from": "old", "to": "new"}},
        }
    ]


def test_compare_releases_is_identical_for_a_republish() -> None:
    graph = build_demo_graph()
    release, _ = publish_release(graph)
    diff = compare_releases(release, release)
    assert diff.identical is True
    assert diff.node_changes == []
    assert diff.edge_changes == []
    assert diff.resource_changes == []
    assert diff.from_semantic_fingerprint == diff.to_semantic_fingerprint


def test_compare_releases_reports_one_delta_for_one_config_change() -> None:
    graph = build_demo_graph()
    first, _ = publish_release(graph)

    changed = graph.model_copy(
        update={
            "nodes": [
                n.model_copy(update={"config": {**n.config, "extra": "x"}})
                if n.id == "input_1"
                else n
                for n in graph.nodes
            ]
        }
    )
    second, second_created = publish_release(changed)
    assert second_created is True

    diff = compare_releases(first, second)
    assert diff.identical is False
    assert len(diff.node_changes) == 1
    assert diff.node_changes[0].id == "input_1"
    assert diff.node_changes[0].change == "modified"


def test_compare_releases_endpoint_round_trip() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    first = client.post(f"/api/graphs/{graph.id}/releases", json={}).json()["release"]

    changed = graph.model_copy(
        update={
            "nodes": [
                n.model_copy(update={"config": {**n.config, "extra": "x"}})
                if n.id == "input_1"
                else n
                for n in graph.nodes
            ]
        }
    )
    storage.save_graph(changed)
    second = client.post(f"/api/graphs/{graph.id}/releases", json={}).json()["release"]

    response = client.get(f"/api/graph-releases/{first['id']}/compare/{second['id']}")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["identical"] is False
    assert body["from_release_id"] == first["id"]
    assert body["to_release_id"] == second["id"]
    assert len(body["node_changes"]) == 1


def test_compare_releases_endpoint_404_for_unknown_release() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    release = client.post(f"/api/graphs/{graph.id}/releases", json={}).json()["release"]

    assert client.get(f"/api/graph-releases/rel_missing/compare/{release['id']}").status_code == 404
    assert client.get(f"/api/graph-releases/{release['id']}/compare/rel_missing").status_code == 404
