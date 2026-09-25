"""Node ↔ resource-registry bindings (studio-graph-workbench-redesign-plan.md,
Wave 4a / STO-605).

The single source of truth for which node config fields reference which
resource registry. Every consumer walks `node_bindings`: compile-time
validation (`compiler.py`), release/run resource snapshots
(`releases.py`), execution (`nodes.py`), and the reverse "used by" index
(`resource_usages`). Mirrored by the SDK's `NODE_BINDING_FIELDS`
(packages/agent-graph-sdk/src/bindings.ts); `tests/test_resource_bindings.py`
checks the two agree.

A binding is a *live reference*: draft runs read the resource's current
content, and publishing a release freezes it via `resource_snapshots` —
the same contract tool bindings already had.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .builtin_tools import BUILTIN_TOOL_IDS
from .models import GraphCatalogEntry, GraphDefinition, GraphEdge, GraphNode

# node type -> ((config field, registry kind), ...)
BINDING_FIELDS: dict[str, tuple[tuple[str, str], ...]] = {
    "prompt": (("promptId", "prompts"),),
    "llm": (("llmProfileId", "llm_profiles"), ("systemPromptId", "prompts")),
    "tool_loop": (("llmProfileId", "llm_profiles"), ("systemPromptId", "prompts")),
    "tool": (("toolName", "tools"),),
}

# Tool ids that are code, not stored resources (see compiler.py).
CODE_TOOL_IDS = frozenset({"lookup_topic", *BUILTIN_TOOL_IDS})


@dataclass(frozen=True)
class Binding:
    field: str
    kind: str
    resource_id: str


def node_bindings(node: GraphNode) -> list[Binding]:
    """The registry references `node` holds (empty values and code tools skipped)."""
    bindings: list[Binding] = []
    for field, kind in BINDING_FIELDS.get(node.type.value, ()):
        value = node.config.get(field)
        if not isinstance(value, str) or not value.strip():
            continue
        if kind == "tools" and value in CODE_TOOL_IDS:
            continue
        bindings.append(Binding(field=field, kind=kind, resource_id=value))
    return bindings


def edge_bindings(graph: GraphDefinition) -> list[tuple[GraphEdge, Binding]]:
    """Edges whose transform references a Transforms library entry."""
    return [
        (edge, Binding(field="transform", kind="transforms", resource_id=edge.transform.transform_id))
        for edge in graph.edges
        if edge.transform is not None and edge.transform.transform_id
    ]


def resource_usages(
    graphs: list[GraphCatalogEntry],
    kind: str,
    resource_id: str,
    tools_by_id: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Every node that references `kind:resource_id`. For `mcp_servers`, also
    the tool-bound nodes whose tool dispatches to that server (`via`).
    Walks the graph catalog (storage.list_graph_catalog), whose bindings are
    `node_bindings` output precomputed per graph."""
    via_tools: set[str] = set()
    if kind == "mcp_servers" and tools_by_id:
        via_tools = {
            tid for tid, tool in tools_by_id.items() if tool.get("mcp_server_id") == resource_id
        }

    usages: list[dict[str, Any]] = []
    for graph in graphs:
        for binding in graph.bindings:
            direct = binding.kind == kind and binding.resource_id == resource_id
            via = binding.kind == "tools" and binding.resource_id in via_tools
            if not (direct or via):
                continue
            usages.append(
                {
                    "graph_id": graph.id,
                    "graph_name": graph.name,
                    "node_id": binding.node_id,
                    "node_type": binding.node_type,
                    "field": binding.field,
                    "via": None if direct else f"tools:{binding.resource_id}",
                }
            )
    return usages
