"""Contract validation pass.

Part of the P0 graph foundation program
(docs/planning/features/p0-graph-foundation-design-plan.md), Slice B.
`compiler.py`'s structural pass answers "is this graph shape valid"; this
module answers "do the connected ports actually agree with each other" —
port existence/direction, contract-kind compatibility, transform validity,
required-input coverage, and unambiguous input binding. Called from
`compiler.py`'s `validate_graph`, so every existing caller (`/validate`,
`/compile`, publish) gets contract diagnostics for free.

Reads the same `ports.py` catalog/resolution helpers the runtime uses
(`default_input_port`, `find_input_port`, etc.), so a diagnostic here can
never describe a port the runtime doesn't actually resolve the same way.
"""

from __future__ import annotations

from .models import (
    Diagnostic,
    EdgeTransform,
    GraphDefinition,
    GraphNode,
    GraphPort,
    NodeType,
    PortKind,
)
from .ports import (
    accepts_any_kind,
    default_input_port,
    default_output_port,
    find_input_port,
    find_output_port,
    input_ports_for,
)

# design doc, "Compatibility rules": tool-result/artifact/structured-json
# require an explicit transform (or a compatible schema on both ports) to
# cross a kind boundary; equal kinds are always compatible.
_STRUCTURED_KINDS = frozenset({PortKind.TOOL_RESULT, PortKind.ARTIFACT, PortKind.STRUCTURED_JSON})

# design doc, "Compatibility rules": "JSON Schema support begins with type,
# required, properties, items, and enum; unsupported keywords warn rather
# than producing a false compatibility claim."
_SCHEMA_SUPPORTED_KEYWORDS = frozenset({"type", "required", "properties", "items", "enum"})


def validate_contracts(graph: GraphDefinition) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    diagnostics.extend(_validate_edges(graph))
    diagnostics.extend(_validate_required_inputs(graph))
    diagnostics.extend(_validate_ambiguous_bindings(graph))
    return diagnostics


def _validate_edges(graph: GraphDefinition) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    nodes_by_id = {n.id: n for n in graph.nodes}

    for edge in graph.edges:
        source_node = nodes_by_id.get(edge.source)
        target_node = nodes_by_id.get(edge.target)
        if source_node is None or target_node is None:
            # Already reported by compiler.py's structural pass
            # (GRAPH_EDGE_UNKNOWN_SOURCE/TARGET) — don't duplicate.
            continue

        source_port, source_diag = _resolve_edge_port(
            source_node, edge.source_port, "output", node_id=edge.source, edge_id=edge.id
        )
        if source_diag is not None:
            diagnostics.append(source_diag)
            continue
        target_port, target_diag = _resolve_edge_port(
            target_node, edge.target_port, "input", node_id=edge.target, edge_id=edge.id
        )
        if target_diag is not None:
            diagnostics.append(target_diag)
            continue
        if source_port is None or target_port is None:
            # Neither side declares a port here (e.g. an `input` node's
            # absent input port, or an `output` node's absent output port)
            # — nothing to check a contract against.
            continue

        # design doc, "Current state and migration constraints": "A graph
        # with no explicit ports is normalized using node-type defaults and
        # only warned when an inferred contract is too broad to verify."
        # The default port catalog itself has kind mismatches baked in
        # (e.g. `code_exec`'s structured-json input fed by an LLM's message
        # output) that existing graphs already rely on — enforcing those
        # as blocking would make
        # today's graphs permanently uncompilable. Kind incompatibility is
        # only ever blocking when BOTH sides are author-declared ports
        # (opted into the typed contract system); an inferred default on
        # either side downgrades it to a warning instead.
        both_explicit = bool(source_node.output_ports) and bool(target_node.input_ports)
        kind_error = (
            None
            if accepts_any_kind(target_node)
            else _kind_incompatibility(source_port, target_port, edge.transform)
        )
        if kind_error:
            diagnostics.append(
                Diagnostic(
                    severity="error" if both_explicit else "warning",
                    category="contract",
                    code=(
                        "EDGE_CONTRACT_KIND_INCOMPATIBLE"
                        if both_explicit
                        else "CONTRACT_KIND_INFERRED_MISMATCH"
                    ),
                    node_id=edge.target,
                    edge_id=edge.id,
                    port_id=target_port.id,
                    message=kind_error,
                    blocking=both_explicit,
                )
            )

        if edge.transform is not None:
            transform_error = _validate_transform(edge.transform)
            if transform_error:
                diagnostics.append(
                    Diagnostic(
                        severity="error",
                        category="contract",
                        code="EDGE_TRANSFORM_INVALID",
                        node_id=edge.target,
                        edge_id=edge.id,
                        port_id=target_port.id,
                        message=transform_error,
                        blocking=True,
                    )
                )

        diagnostics.extend(_validate_schema(source_port, target_port, edge.target, edge.id))

    return diagnostics


def _resolve_edge_port(
    node: GraphNode, explicit_port_id: str | None, direction: str, *, node_id: str, edge_id: str
) -> tuple[GraphPort | None, Diagnostic | None]:
    if explicit_port_id is None:
        port = default_output_port(node) if direction == "output" else default_input_port(node)
        return port, None

    finder = find_output_port if direction == "output" else find_input_port
    port = finder(node, explicit_port_id)
    if port is None:
        code = (
            "EDGE_SOURCE_PORT_NOT_FOUND" if direction == "output" else "EDGE_TARGET_PORT_NOT_FOUND"
        )
        return None, Diagnostic(
            severity="error",
            category="contract",
            code=code,
            node_id=node_id,
            edge_id=edge_id,
            port_id=explicit_port_id,
            message=f"Node {node.id!r} has no {direction} port {explicit_port_id!r}",
            blocking=True,
        )
    if port.direction != direction:
        return None, Diagnostic(
            severity="error",
            category="contract",
            code="EDGE_PORT_DIRECTION_INVALID",
            node_id=node_id,
            edge_id=edge_id,
            port_id=explicit_port_id,
            message=f"Port {explicit_port_id!r} on node {node.id!r} is not a {direction} port",
            blocking=True,
        )
    return port, None


def _kind_incompatibility(
    source_port: GraphPort, target_port: GraphPort, transform: EdgeTransform | None
) -> str | None:
    source_kind = source_port.contract.kind
    target_kind = target_port.contract.kind
    if source_kind == target_kind:
        return None

    if target_kind == PortKind.MESSAGE:
        if transform is not None and transform.type == "format_message":
            return None
        return (
            f"target port {target_port.id!r} expects 'message' from a {source_kind.value!r} "
            "source; add a format_message transform (select the edge → Transform → Format message)"
        )

    if source_kind in _STRUCTURED_KINDS or target_kind in _STRUCTURED_KINDS:
        if transform is not None:
            return None
        if source_port.contract.schema_ is not None and target_port.contract.schema_ is not None:
            return None
        return (
            f"{source_kind.value!r} -> {target_kind.value!r} requires an explicit transform "
            "or a compatible JSON Schema on both ports (select the edge → Transform)"
        )

    return f"port kind {source_kind.value!r} is not compatible with {target_kind.value!r}"


def _validate_transform(transform: EdgeTransform) -> str | None:
    if transform.type == "select" and not transform.pointer:
        return "select transform requires 'pointer'"
    if transform.type == "wrap" and not transform.field:
        return "wrap transform requires 'field'"
    if transform.type == "coerce" and not transform.target_type:
        return "coerce transform requires 'target_type'"
    if transform.type == "format_message" and not transform.template:
        return "format_message transform requires 'template'"
    return None


def _validate_schema(
    source_port: GraphPort, target_port: GraphPort, node_id: str, edge_id: str
) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    target_schema = target_port.contract.schema_
    if target_schema is None:
        return diagnostics

    source_schema = source_port.contract.schema_
    if source_schema is None:
        diagnostics.append(
            Diagnostic(
                severity="warning",
                category="contract",
                code="CONTRACT_SCHEMA_UNKNOWN",
                node_id=node_id,
                edge_id=edge_id,
                port_id=target_port.id,
                message=(
                    f"Source port {source_port.id!r} declares no schema; target port "
                    f"{target_port.id!r} expects one, so compatibility cannot be verified"
                ),
                blocking=False,
            )
        )
        return diagnostics

    unsupported = (set(source_schema) | set(target_schema)) - _SCHEMA_SUPPORTED_KEYWORDS
    for keyword in sorted(unsupported):
        diagnostics.append(
            Diagnostic(
                severity="warning",
                category="contract",
                code="CONTRACT_SCHEMA_UNKNOWN",
                node_id=node_id,
                edge_id=edge_id,
                port_id=target_port.id,
                message=f"Schema keyword {keyword!r} is not verified by P0 contract checking",
                blocking=False,
            )
        )

    source_type = source_schema.get("type")
    target_type = target_schema.get("type")
    if source_type is not None and target_type is not None and source_type != target_type:
        diagnostics.append(
            Diagnostic(
                severity="error",
                category="contract",
                code="EDGE_SCHEMA_INCOMPATIBLE",
                node_id=node_id,
                edge_id=edge_id,
                port_id=target_port.id,
                message=(
                    f"Schema type {source_type!r} is incompatible with expected {target_type!r}"
                ),
                blocking=True,
            )
        )
    return diagnostics


def _validate_required_inputs(graph: GraphDefinition) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    nodes_by_id = {n.id: n for n in graph.nodes}

    bound: set[tuple[str, str]] = set()
    for edge in graph.edges:
        target_node = nodes_by_id.get(edge.target)
        if target_node is None:
            continue
        port = (
            find_input_port(target_node, edge.target_port)
            if edge.target_port
            else default_input_port(target_node)
        )
        if port is not None:
            bound.add((edge.target, port.id))

    for node in graph.nodes:
        if node.id == graph.entry_node_id:
            # The entry node never has an incoming edge by definition (it's
            # where execution starts) — e.g. a migrated legacy flow can
            # start on a `prompt` node, not only `input`, which otherwise
            # has no way to satisfy its catalog-default required input.
            continue
        for port in input_ports_for(node):
            if not port.contract.required:
                continue
            if (node.id, port.id) in bound:
                continue
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    category="contract",
                    code="NODE_REQUIRED_INPUT_UNBOUND",
                    node_id=node.id,
                    port_id=port.id,
                    message=(
                        f"Required input port {port.id!r} of node {node.id!r} has no bound edge"
                    ),
                    blocking=True,
                )
            )
    return diagnostics


def _validate_ambiguous_bindings(graph: GraphDefinition) -> list[Diagnostic]:
    """Design doc, "Multi-input-edge merge rule": more than one edge may
    target the same (node, input_port) pair only when mutual exclusivity is
    guaranteed by construction — i.e. their sources sit on different,
    never-simultaneously-taken branches of a common upstream router/branch
    node. `_branch_exclusivity` computes that via reachability rather than
    literally requiring the converging edges to be the router's own
    immediate siblings, because the current demo graph's real shape
    (`tool_lookup` and `llm_answer`, two hops downstream of `router_1` on
    its two branches, both feeding `output_1`) is exactly this transitive
    case, not the literal-sibling one — the doc's own worked example
    ("Output has one from each router branch") already describes only the
    non-literal, transitive case in practice."""
    diagnostics: list[Diagnostic] = []
    nodes_by_id = {n.id: n for n in graph.nodes}

    groups: dict[tuple[str, str], list] = {}
    for edge in graph.edges:
        target_node = nodes_by_id.get(edge.target)
        if target_node is None:
            continue
        port = (
            find_input_port(target_node, edge.target_port)
            if edge.target_port
            else default_input_port(target_node)
        )
        if port is None:
            continue
        groups.setdefault((edge.target, port.id), []).append(edge)

    exclusivity = _branch_exclusivity(graph)

    for (node_id, port_id), edges in groups.items():
        if len(edges) < 2:
            continue
        if _all_mutually_exclusive({e.source for e in edges}, exclusivity):
            continue
        for edge in edges:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    category="contract",
                    code="NODE_INPUT_PORT_AMBIGUOUS_BINDING",
                    node_id=node_id,
                    edge_id=edge.id,
                    port_id=port_id,
                    message=(
                        f"Input port {port_id!r} of node {node_id!r} is bound by multiple edges "
                        "with no runtime exclusivity guarantee"
                    ),
                    blocking=True,
                )
            )
    return diagnostics


def _branch_exclusivity(graph: GraphDefinition) -> dict[str, dict[str, str]]:
    """`node_id -> {router_id: owning_branch_edge_id}` — a node appears
    under a router only when it's reachable from exactly one of that
    router's outgoing edges (a merge point reachable from two or more
    branches is deliberately left out: it isn't exclusive to either)."""
    adjacency: dict[str, list[str]] = {n.id: [] for n in graph.nodes}
    for edge in graph.edges:
        if edge.source in adjacency:
            adjacency[edge.source].append(edge.target)

    membership: dict[str, dict[str, str]] = {}
    for node in graph.nodes:
        if node.type not in (NodeType.ROUTER, NodeType.BRANCH):
            continue
        branches = [e for e in graph.edges if e.source == node.id]
        reach_by_branch: dict[str, set[str]] = {}
        for branch_edge in branches:
            seen: set[str] = set()
            stack = [branch_edge.target]
            while stack:
                current = stack.pop()
                if current in seen:
                    continue
                seen.add(current)
                stack.extend(adjacency.get(current, []))
            reach_by_branch[branch_edge.id] = seen

        for branch_edge in branches:
            for member in reach_by_branch[branch_edge.id]:
                owned_by_others = any(
                    other.id != branch_edge.id and member in reach_by_branch[other.id]
                    for other in branches
                )
                if owned_by_others:
                    continue
                membership.setdefault(member, {})[node.id] = branch_edge.id
    return membership


def _all_mutually_exclusive(source_ids: set[str], membership: dict[str, dict[str, str]]) -> bool:
    sources = list(source_ids)
    for i in range(len(sources)):
        for j in range(i + 1, len(sources)):
            if not _pair_exclusive(sources[i], sources[j], membership):
                return False
    return True


def _pair_exclusive(a: str, b: str, membership: dict[str, dict[str, str]]) -> bool:
    routers_a = membership.get(a, {})
    routers_b = membership.get(b, {})
    return any(
        branch_b is not None and branch_b != branch_a
        for router_id, branch_a in routers_a.items()
        for branch_b in [routers_b.get(router_id)]
    )


__all__ = ["validate_contracts"]
