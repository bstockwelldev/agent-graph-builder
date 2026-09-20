"""P0 graph foundation, Slice C: release publishing (resource_snapshots
resolution, fingerprint idempotency, blocking diagnostics)."""

from __future__ import annotations

import pytest

from app import storage
from app.demo_graph import build_demo_graph
from app.models import GraphEdge, GraphNode, NodePosition, NodeType
from app.releases import ReleasePublishBlocked, publish_release, resolve_resource_snapshots


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    # save_release is a plain insert, not an upsert (see
    # test_release_storage.py) — isolate per test so publishing the same
    # graph twice across tests never collides on a shared DB file.
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _graph_with_tool_node(tool_node: GraphNode, graph_id: str) -> object:
    demo = build_demo_graph()
    edges = [e for e in demo.edges if e.id != "e_llmanswer_output"]
    edges.append(GraphEdge(id="e_llmanswer_tool", source="llm_answer", target=tool_node.id))
    edges.append(GraphEdge(id=f"e_{tool_node.id}_output", source=tool_node.id, target="output_1"))
    return demo.model_copy(
        update={"id": graph_id, "nodes": [*demo.nodes, tool_node], "edges": edges}
    )


def test_resolve_resource_snapshots_empty_for_demo_graph() -> None:
    """The demo graph's only tool node uses lookup_topic — code, not a
    stored resource — so there's nothing to snapshot."""
    graph = build_demo_graph()
    snapshots, diagnostics = resolve_resource_snapshots(graph)
    assert snapshots == {}
    assert diagnostics == []


def test_resolve_resource_snapshots_includes_registered_tool() -> None:
    storage.save_resource("tools", "custom_tool", {"id": "custom_tool", "description": "d"})
    node = GraphNode(
        id="tool_custom",
        type=NodeType.TOOL,
        position=NodePosition(x=0, y=0),
        config={"toolName": "custom_tool"},
    )
    graph = _graph_with_tool_node(node, "graph_snapshot_tool")

    snapshots, diagnostics = resolve_resource_snapshots(graph)

    assert diagnostics == []
    assert snapshots["tools:custom_tool"] == {"id": "custom_tool", "description": "d"}


def test_resolve_resource_snapshots_includes_bound_mcp_server() -> None:
    storage.save_resource(
        "mcp_servers",
        "srv1",
        {"id": "srv1", "name": "Server", "url": "http://x", "transport": "http", "enabled": True},
    )
    storage.save_resource(
        "tools",
        "mcp_tool",
        {
            "id": "mcp_tool",
            "description": "d",
            "mcp_server_id": "srv1",
            "mcp_tool_name": "do_thing",
        },
    )
    node = GraphNode(
        id="tool_mcp",
        type=NodeType.TOOL,
        position=NodePosition(x=0, y=0),
        config={"toolName": "mcp_tool"},
    )
    graph = _graph_with_tool_node(node, "graph_snapshot_mcp")

    snapshots, diagnostics = resolve_resource_snapshots(graph)

    assert diagnostics == []
    assert "tools:mcp_tool" in snapshots
    assert snapshots["mcp_servers:srv1"]["url"] == "http://x"


def test_resolve_resource_snapshots_unresolved_tool_blocks() -> None:
    node = GraphNode(
        id="tool_missing",
        type=NodeType.TOOL,
        position=NodePosition(x=0, y=0),
        config={"toolName": "does_not_exist"},
    )
    graph = _graph_with_tool_node(node, "graph_snapshot_missing")

    snapshots, diagnostics = resolve_resource_snapshots(graph)

    assert snapshots == {}
    assert any(
        d.code == "RELEASE_RESOURCE_UNRESOLVED" and d.blocking and d.node_id == "tool_missing"
        for d in diagnostics
    )


def test_resolve_resource_snapshots_unresolved_mcp_server_blocks() -> None:
    storage.save_resource(
        "tools",
        "orphan_mcp_tool",
        {
            "id": "orphan_mcp_tool",
            "description": "d",
            "mcp_server_id": "no_such_server",
            "mcp_tool_name": "do_thing",
        },
    )
    node = GraphNode(
        id="tool_orphan",
        type=NodeType.TOOL,
        position=NodePosition(x=0, y=0),
        config={"toolName": "orphan_mcp_tool"},
    )
    graph = _graph_with_tool_node(node, "graph_snapshot_orphan_mcp")

    snapshots, diagnostics = resolve_resource_snapshots(graph)

    assert "tools:orphan_mcp_tool" in snapshots
    assert any(d.code == "RELEASE_RESOURCE_UNRESOLVED" and d.blocking for d in diagnostics)


def test_resolve_resource_snapshots_includes_per_graph_knowledge() -> None:
    graph = build_demo_graph()
    storage.save_resource(
        "knowledge",
        graph.id,
        {
            "documents": [],
            "chunks": [],
            "embedding_provider": "stub",
            "embedding_model_id": "stub",
        },
    )
    snapshots, diagnostics = resolve_resource_snapshots(graph)
    assert diagnostics == []
    assert f"knowledge:{graph.id}" in snapshots


def test_publish_release_succeeds_for_demo_graph() -> None:
    graph = build_demo_graph()
    release, created = publish_release(graph)
    assert created is True
    assert release.graph_id == graph.id
    assert release.graph == graph
    assert release.resource_snapshots == {}
    assert len(release.document_fingerprint) == 64
    assert len(release.semantic_fingerprint) == 64


def test_publish_release_raises_on_unresolved_resource() -> None:
    node = GraphNode(
        id="tool_missing",
        type=NodeType.TOOL,
        position=NodePosition(x=0, y=0),
        config={"toolName": "does_not_exist"},
    )
    graph = _graph_with_tool_node(node, "graph_publish_blocked")
    with pytest.raises(ReleasePublishBlocked) as exc_info:
        publish_release(graph)
    assert any(d.code == "RELEASE_RESOURCE_UNRESOLVED" for d in exc_info.value.diagnostics)
    # Nothing should have been persisted for a blocked publish.
    assert storage.get_release_index(graph.id) == []


def test_publish_release_raises_on_structural_diagnostics() -> None:
    graph = build_demo_graph()
    broken = graph.model_copy(update={"entry_node_id": "does_not_exist"})
    with pytest.raises(ReleasePublishBlocked) as exc_info:
        publish_release(broken)
    assert any(d.code == "GRAPH_MISSING_ENTRY_NODE" for d in exc_info.value.diagnostics)


def test_publish_release_is_idempotent_on_semantic_fingerprint() -> None:
    graph = build_demo_graph()
    first, first_created = publish_release(graph)
    second, second_created = publish_release(graph)

    assert first_created is True
    assert second_created is False
    assert second.id == first.id
    assert len(storage.get_release_index(graph.id)) == 1


def test_publish_release_ignores_cosmetic_changes_for_idempotency() -> None:
    """Moving a node (canvas position only) must not create a new release —
    semantic_fingerprint excludes position, matching document_fingerprint's
    own position-sensitivity split."""
    graph = build_demo_graph()
    first, _ = publish_release(graph)

    moved = graph.model_copy(
        update={
            "nodes": [
                n.model_copy(update={"position": NodePosition(x=n.position.x + 50, y=n.position.y)})
                for n in graph.nodes
            ]
        }
    )
    second, second_created = publish_release(moved, release_notes="moved some nodes")

    assert second_created is False
    assert second.id == first.id
    assert second.release_notes != "moved some nodes"  # existing release's notes are untouched


def test_publish_release_creates_new_release_on_real_change() -> None:
    graph = build_demo_graph()
    first, _ = publish_release(graph)

    changed = graph.model_copy(
        update={
            "nodes": [
                (
                    n.model_copy(update={"config": {**n.config, "extra": "x"}})
                    if n.id == "input_1"
                    else n
                )
                for n in graph.nodes
            ]
        }
    )
    second, second_created = publish_release(changed)

    assert second_created is True
    assert second.id != first.id
    assert len(storage.get_release_index(graph.id)) == 2


def test_editing_the_draft_after_publish_does_not_change_the_release() -> None:
    """Exit gate: 'Editing a draft cannot change a published release or a
    run started from it.'"""
    graph = build_demo_graph()
    release, _ = publish_release(graph)
    original_graph_snapshot = release.graph.model_copy(deep=True)

    storage.save_graph(graph.model_copy(update={"name": "Renamed after publish"}))

    reread = storage.get_release(release.id, graph.id)
    from app.models import GraphRelease

    reread_release = GraphRelease.model_validate(reread)
    assert reread_release.graph == original_graph_snapshot
    assert reread_release.graph.name != "Renamed after publish"
