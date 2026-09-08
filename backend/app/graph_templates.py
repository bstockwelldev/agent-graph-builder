"""Graph templates for the graph library (create-from-scratch flows)."""

from __future__ import annotations

import uuid

from .demo_graph import build_demo_graph
from .models import EdgeKind, GraphDefinition, GraphEdge, GraphNode, NodePosition, NodeType


def new_graph_id() -> str:
    return f"graph_{uuid.uuid4().hex[:12]}"


def build_blank_graph(graph_id: str, name: str) -> GraphDefinition:
    nodes = [
        GraphNode(
            id="input_1",
            type=NodeType.INPUT,
            position=NodePosition(x=120, y=200),
            config={"variableName": "question"},
        ),
        GraphNode(
            id="output_1",
            type=NodeType.OUTPUT,
            position=NodePosition(x=420, y=200),
            config={},
        ),
    ]
    edges = [
        GraphEdge(
            id="e_input_output",
            source="input_1",
            target="output_1",
            kind=EdgeKind.SEQUENCE,
        ),
    ]
    return GraphDefinition(
        id=graph_id,
        name=name,
        entry_node_id="input_1",
        nodes=nodes,
        edges=edges,
    )


def build_graph_from_demo_template(graph_id: str, name: str) -> GraphDefinition:
    demo = build_demo_graph()
    return demo.model_copy(update={"id": graph_id, "name": name, "updated_at": None})


def create_graph_definition(name: str, template: str) -> GraphDefinition:
    graph_id = new_graph_id()
    if template == "demo":
        return build_graph_from_demo_template(graph_id, name)
    return build_blank_graph(graph_id, name)
