"""Tests for graph orientation field on GraphDefinition."""

from app.graph_templates import build_blank_graph
from app.models import GraphDefinition


def test_blank_graph_defaults_orientation_auto() -> None:
    graph = build_blank_graph("graph_test", "Test")
    assert graph.orientation == "auto"


def test_graph_definition_accepts_orientation_pins() -> None:
    graph = GraphDefinition(
        id="graph_pin",
        name="Pinned",
        entry_node_id="input_1",
        nodes=[],
        edges=[],
        orientation="vertical",
    )
    assert graph.orientation == "vertical"


def test_graph_definition_missing_orientation_defaults_auto() -> None:
    graph = GraphDefinition.model_validate(
        {
            "id": "graph_legacy",
            "name": "Legacy",
            "entry_node_id": "input_1",
            "nodes": [],
            "edges": [],
        }
    )
    assert graph.orientation == "auto"
