"""Static graph validation (a trimmed slice of EDD section 9.1).

Only the checks that matter for this node/edge taxonomy are implemented:
missing entry node, dangling edge references, unreachable nodes, cycles
(unsupported in this POC), a router without a fallback edge, and an
unsupported tool binding. Everything else in the EDD's validation list
(port/schema compatibility, draft-in-production, embedding dimensions, etc.)
does not apply to this slice.
"""

from __future__ import annotations

from . import storage
from .builtin_tools import BUILTIN_TOOL_IDS
from .models import CompileResult, Diagnostic, EdgeKind, GraphDefinition, NodeType
from .node_configs import validate_node_config
from .nodes import EXECUTORS

# Tool ids valid without a stored registry entry (studio-consolidation
# Phase 3): the original POC demo tool, plus the two builtins.
_KNOWN_TOOL_IDS = frozenset({"lookup_topic", *BUILTIN_TOOL_IDS})


def validate_graph(graph: GraphDefinition) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    node_ids = {n.id for n in graph.nodes}

    if graph.entry_node_id not in node_ids:
        diagnostics.append(
            Diagnostic(
                severity="error",
                code="GRAPH_MISSING_ENTRY_NODE",
                message=f"entryNodeId {graph.entry_node_id!r} does not reference a node in this graph",
                blocking=True,
            )
        )

    for edge in graph.edges:
        if edge.source not in node_ids:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    code="GRAPH_EDGE_UNKNOWN_SOURCE",
                    node_id=edge.source,
                    edge_id=edge.id,
                    message=f"Edge {edge.id!r} references unknown source node {edge.source!r}",
                    blocking=True,
                )
            )
        if edge.target not in node_ids:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    code="GRAPH_EDGE_UNKNOWN_TARGET",
                    node_id=edge.target,
                    edge_id=edge.id,
                    message=f"Edge {edge.id!r} references unknown target node {edge.target!r}",
                    blocking=True,
                )
            )
        if edge.kind == EdgeKind.CONDITIONAL and not edge.condition:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    code="GRAPH_CONDITIONAL_EDGE_MISSING_CONDITION",
                    node_id=edge.source,
                    edge_id=edge.id,
                    message=f"Conditional edge {edge.id!r} has no condition string",
                    blocking=True,
                )
            )

    # Reachability from entry node.
    adjacency: dict[str, list[str]] = {n.id: [] for n in graph.nodes}
    for edge in graph.edges:
        if edge.source in adjacency:
            adjacency[edge.source].append(edge.target)

    reachable: set[str] = set()
    if graph.entry_node_id in node_ids:
        stack = [graph.entry_node_id]
        while stack:
            current = stack.pop()
            if current in reachable:
                continue
            reachable.add(current)
            stack.extend(adjacency.get(current, []))

    for node in graph.nodes:
        if node.id not in reachable:
            diagnostics.append(
                Diagnostic(
                    severity="warning",
                    code="GRAPH_UNREACHABLE_NODE",
                    node_id=node.id,
                    message=f"Node {node.id!r} is not reachable from the entry node",
                    blocking=False,
                )
            )

    # Cycle detection (POC runtime does not support loops).
    if _has_cycle(adjacency):
        diagnostics.append(
            Diagnostic(
                severity="error",
                code="GRAPH_INVALID_CYCLE",
                message="Graph contains a cycle; this POC supports acyclic graphs only",
                blocking=True,
            )
        )

    # Router AND branch specific requirement: a default/fallback edge must
    # exist. Both compile to LangGraph conditional edges in runtime.py
    # (studio-consolidation Phase 2 generalizes the router-only wiring to
    # cover `branch` too), so both need the same fallback guarantee; the
    # diagnostic code prefix stays ROUTER_* for the original type so
    # existing consumers of those exact codes are unaffected.
    for node in graph.nodes:
        if node.type not in (NodeType.ROUTER, NodeType.BRANCH):
            continue
        prefix = "ROUTER" if node.type == NodeType.ROUTER else "BRANCH"
        outgoing = [e for e in graph.edges if e.source == node.id]
        has_default = any(e.kind == EdgeKind.DEFAULT for e in outgoing)
        has_conditional = any(e.kind == EdgeKind.CONDITIONAL for e in outgoing)
        if not outgoing:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    code=f"{prefix}_NO_OUTGOING_EDGES",
                    node_id=node.id,
                    message=f"{node.type.value} node {node.id!r} has no outgoing edges",
                    blocking=True,
                )
            )
        elif not has_default:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    code=f"{prefix}_MISSING_FALLBACK",
                    node_id=node.id,
                    message=f"{node.type.value} node {node.id!r} has no default/fallback outgoing edge",
                    blocking=True,
                )
            )
        elif not has_conditional:
            diagnostics.append(
                Diagnostic(
                    severity="warning",
                    code=f"{prefix}_NO_CONDITIONAL_EDGES",
                    node_id=node.id,
                    message=f"{node.type.value} node {node.id!r} only has a default edge; it never branches",
                    blocking=False,
                )
            )

    # Tool binding: lookup_topic, a builtin, or a registered tool
    # (studio-consolidation Phase 3's registry, backend/app/resource_models.py)
    # are all valid; anything else is unsupported.
    for node in graph.nodes:
        if node.type != NodeType.TOOL:
            continue
        tool_name = node.config.get("toolName")
        if tool_name in _KNOWN_TOOL_IDS:
            continue
        if tool_name is not None and storage.get_resource("tools", tool_name) is not None:
            continue
        diagnostics.append(
            Diagnostic(
                severity="error",
                code="UNSUPPORTED_TOOL_BINDING",
                node_id=node.id,
                message=f"Tool node {node.id!r} references unsupported tool {tool_name!r}",
                blocking=True,
            )
        )

    # Generic safety net: any NodeType with no registered executor in
    # nodes.py's EXECUTORS dict blocks compile with a clear diagnostic
    # instead of runtime.py KeyError-ing on EXECUTORS[node.type] mid-run.
    # All twelve current node types have executors as of studio-
    # consolidation Phase 2; this now only guards future additions.
    for node in graph.nodes:
        if node.type.value not in EXECUTORS:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    code="NODE_TYPE_NOT_EXECUTABLE",
                    node_id=node.id,
                    message=f"Node type {node.type.value!r} has no runtime executor yet",
                    blocking=True,
                )
            )

    # Typed per-node-type config validation (studio-consolidation Phase 1).
    for node in graph.nodes:
        for message in validate_node_config(node.type, node.config):
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    code="NODE_CONFIG_INVALID",
                    node_id=node.id,
                    message=f"{node.type.value} node {node.id!r}: {message}",
                    blocking=True,
                )
            )

    return diagnostics


def _has_cycle(adjacency: dict[str, list[str]]) -> bool:
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {node_id: WHITE for node_id in adjacency}

    def visit(node_id: str) -> bool:
        color[node_id] = GRAY
        for neighbor in adjacency.get(node_id, []):
            if color.get(neighbor, WHITE) == GRAY:
                return True
            if color.get(neighbor, WHITE) == WHITE and visit(neighbor):
                return True
        color[node_id] = BLACK
        return False

    return any(color[node_id] == WHITE and visit(node_id) for node_id in adjacency)


def compile_graph(graph: GraphDefinition, compiled_workflow_id: str | None) -> CompileResult:
    diagnostics = validate_graph(graph)
    blocking = any(d.blocking for d in diagnostics)
    return CompileResult(
        graph_id=graph.id,
        compiled_workflow_id=None if blocking else compiled_workflow_id,
        diagnostics=diagnostics,
        ok=not blocking,
    )
