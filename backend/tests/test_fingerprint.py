"""P0 graph foundation, Slice A: canonical JSON + fingerprint functions."""

from __future__ import annotations

from app.demo_graph import build_demo_graph
from app.fingerprint import document_fingerprint, semantic_fingerprint
from app.models import GraphDefinition, GraphEdge, GraphNode, NodePosition, NodeType


def test_fingerprints_are_deterministic() -> None:
    graph = build_demo_graph()
    assert document_fingerprint(graph) == document_fingerprint(graph.model_copy())
    assert semantic_fingerprint(graph) == semantic_fingerprint(graph.model_copy())


def test_semantic_fingerprint_is_position_invariant() -> None:
    graph = build_demo_graph()
    moved = graph.model_copy(
        update={
            "nodes": [
                n.model_copy(
                    update={"position": NodePosition(x=n.position.x + 500, y=n.position.y + 500)}
                )
                for n in graph.nodes
            ]
        }
    )
    assert semantic_fingerprint(graph) == semantic_fingerprint(moved)


def test_document_fingerprint_is_position_sensitive() -> None:
    graph = build_demo_graph()
    moved = graph.model_copy(
        update={
            "nodes": [
                n.model_copy(
                    update={"position": NodePosition(x=n.position.x + 500, y=n.position.y + 500)}
                )
                for n in graph.nodes
            ]
        }
    )
    assert document_fingerprint(graph) != document_fingerprint(moved)


def test_fingerprints_change_when_node_config_changes() -> None:
    graph = build_demo_graph()
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
    assert document_fingerprint(graph) != document_fingerprint(changed)
    assert semantic_fingerprint(graph) != semantic_fingerprint(changed)


def test_fingerprints_change_when_edge_condition_changes() -> None:
    graph = build_demo_graph()
    edge = graph.edges[0]
    changed = graph.model_copy(
        update={"edges": [edge.model_copy(update={"condition": "something-new"}), *graph.edges[1:]]}
    )
    assert document_fingerprint(graph) != document_fingerprint(changed)
    assert semantic_fingerprint(graph) != semantic_fingerprint(changed)


def test_fingerprints_change_when_node_added_or_removed() -> None:
    graph = build_demo_graph()
    extra_node = GraphNode(
        id="extra", type=NodeType.PROMPT, position=NodePosition(x=0, y=0), config={}
    )
    added = graph.model_copy(update={"nodes": [*graph.nodes, extra_node]})
    assert document_fingerprint(graph) != document_fingerprint(added)
    assert semantic_fingerprint(graph) != semantic_fingerprint(added)


def test_fingerprints_change_when_edge_added_or_removed() -> None:
    graph = build_demo_graph()
    extra_edge = GraphEdge(id="e_extra", source=graph.nodes[0].id, target=graph.nodes[1].id)
    added = graph.model_copy(update={"edges": [*graph.edges, extra_edge]})
    assert document_fingerprint(graph) != document_fingerprint(added)
    assert semantic_fingerprint(graph) != semantic_fingerprint(added)


def test_empty_graph_does_not_raise() -> None:
    empty = GraphDefinition(id="g", name="Empty", entry_node_id="none", nodes=[], edges=[])
    assert len(document_fingerprint(empty)) == 64
    assert len(semantic_fingerprint(empty)) == 64


def test_document_fingerprint_locks_the_hash_algorithm() -> None:
    """Hardcoded expected digest — locks sort_keys + separators + SHA-256
    as the exact algorithm, not just "some deterministic function". If this
    ever needs to change, it's a deliberate fingerprint-format migration,
    not an accidental regression."""
    graph = GraphDefinition(
        id="fixture_graph",
        name="Fixture",
        entry_node_id="n1",
        nodes=[
            GraphNode(
                id="n1", type=NodeType.INPUT, position=NodePosition(x=1, y=2), config={"a": 1}
            )
        ],
        edges=[],
        orientation="auto",
    )
    assert (
        document_fingerprint(graph)
        == "73915e32970cff35d8586c629f3db9bc375150c2c7471bfe478da3e31ec75f41"
    )
    assert (
        semantic_fingerprint(graph)
        == "fa21e31b4554e37aade554411779cde27352719980c0fa1042c7d64508119a77"
    )
