"""A graph's run input variables, shared by `subgraphs.child_inputs` and
the graph catalog (storage.py), which can't import `subgraphs` without a
cycle."""

from __future__ import annotations

from .models import GraphDefinition, NodeType


def input_variables(graph: GraphDefinition) -> list[str]:
    """Each input node's `variableName` (nodes.py `compute_input`), in node
    order -- mirrors the SDK's `runInputVariables`, falling back to
    `question`."""
    names: list[str] = []
    for node in graph.nodes:
        if node.type != NodeType.INPUT:
            continue
        raw = node.config.get("variableName")
        name = raw.strip() if isinstance(raw, str) and raw.strip() else "question"
        if name not in names:
            names.append(name)
    return names or ["question"]
