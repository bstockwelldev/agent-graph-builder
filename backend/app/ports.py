"""Shared port resolution/projection layer.

Part of the P0 graph foundation program
(docs/planning/features/p0-graph-foundation-design-plan.md). `compiler.py`'s
contract pass (`contracts.py`, Slice B) and `runtime.py`'s node runner both
call into this module, so a validated port never diverges from what
execution actually does.

Slice A introduced the port *schema* (see `models.py`'s `GraphPort`/
`PortContract`) and a resolution/projection layer that was provably
behavior-identical to today's node-keyed dataflow for all twelve current node
types — every catalog entry declared exactly one input port and one output
port, so resolution/projection could never be ambiguous.

Slice B wires `router`/`branch` onto two named output ports —
`passthrough` (the node's own resolved input, verbatim) and `decision` (the
classification/selection dict) — matching the design doc's "separating
control from data" section. `resolve_node_input` now also honors an edge's
explicit `source_port`/`target_port` instead of always reading the source's
first/default port.
"""

from __future__ import annotations

from typing import Any

from .models import GraphDefinition, GraphNode, GraphPort, NodeType, PortContract, PortKind

_ROUTER_LIKE_TYPES = frozenset({NodeType.ROUTER, NodeType.BRANCH})


def _single_io(input_kind: PortKind, output_kind: PortKind) -> dict[str, list[GraphPort]]:
    return {
        "input": [
            GraphPort(
                id="input", name="input", direction="input", contract=PortContract(kind=input_kind)
            )
        ],
        "output": [
            GraphPort(
                id="output",
                name="output",
                direction="output",
                contract=PortContract(kind=output_kind),
            )
        ],
    }


def _router_like_io(input_kind: PortKind) -> dict[str, list[GraphPort]]:
    """`router`/`branch`: one input, two output ports. `passthrough` is
    listed first so it stays the *default* output port — an ordinary
    downstream edge with no explicit `source_port` gets the routed message,
    not the decision dict (design doc, "Router and branch: separating
    control from data")."""
    return {
        "input": [
            GraphPort(
                id="input", name="input", direction="input", contract=PortContract(kind=input_kind)
            )
        ],
        "output": [
            GraphPort(
                id="passthrough",
                name="passthrough",
                direction="output",
                contract=PortContract(kind=input_kind),
            ),
            GraphPort(
                id="decision",
                name="decision",
                direction="output",
                contract=PortContract(kind=PortKind.DECISION),
            ),
        ],
    }


# Mirrors node_configs.py's `_CONFIG_MODELS` registry pattern: a plain dict
# keyed by NodeType, not a dynamic lookup. Unlike that registry, every
# NodeType MUST have an entry here — there is no documented no-entry
# fallback, since a port-less node type would be a design defect, not a
# supported case. `test_ports.py` asserts full NodeType coverage.
_DEFAULT_PORT_CATALOG: dict[NodeType, dict[str, list[GraphPort]]] = {
    NodeType.INPUT: {
        "input": [],
        "output": [
            GraphPort(
                id="output",
                name="output",
                direction="output",
                contract=PortContract(kind=PortKind.MESSAGE),
            )
        ],
    },
    NodeType.PROMPT: _single_io(PortKind.MESSAGE, PortKind.MESSAGE),
    NodeType.LLM: _single_io(PortKind.MESSAGE, PortKind.MESSAGE),
    NodeType.TOOL: _single_io(PortKind.STRUCTURED_JSON, PortKind.TOOL_RESULT),
    # Slice B: passthrough (default) + decision output ports — see
    # `_router_like_io` and `project_node_output`'s router/branch branch.
    NodeType.ROUTER: _router_like_io(PortKind.MESSAGE),
    NodeType.OUTPUT: {
        "input": [
            GraphPort(
                id="input",
                name="input",
                direction="input",
                contract=PortContract(kind=PortKind.MESSAGE),
            )
        ],
        "output": [],
    },
    NodeType.GUARDRAIL: _single_io(PortKind.MESSAGE, PortKind.MESSAGE),
    NodeType.RUBRIC: _single_io(PortKind.MESSAGE, PortKind.MESSAGE),
    NodeType.HUMAN_GATE: _single_io(PortKind.APPROVAL, PortKind.APPROVAL),
    NodeType.TOOL_LOOP: _single_io(PortKind.MESSAGE, PortKind.MESSAGE),
    NodeType.CODE_EXEC: _single_io(PortKind.STRUCTURED_JSON, PortKind.ARTIFACT),
    NodeType.SUBGRAPH: _single_io(PortKind.MESSAGE, PortKind.MESSAGE),
    # Slice B: passthrough (default) + decision output ports, same as ROUTER.
    NodeType.BRANCH: _router_like_io(PortKind.MESSAGE),
}


# Node types whose executor never consumes the incoming edge's payload as
# typed data: `tool` reads its argument from the `inputVariable` state
# variable (the edge only orders execution), and `output` returns whatever
# arrived unchanged. Checking a kind contract on their inferred default
# input produced warnings (e.g. "message -> structured-json") that no node
# setting could resolve. Author-declared `input_ports` are still checked.
_KIND_AGNOSTIC_DEFAULT_INPUTS = frozenset({NodeType.TOOL, NodeType.OUTPUT})


def accepts_any_kind(node: GraphNode) -> bool:
    """True when `node` uses its default input port and that port accepts any kind."""
    return not node.input_ports and node.type in _KIND_AGNOSTIC_DEFAULT_INPUTS


def input_ports_for(node: GraphNode) -> list[GraphPort]:
    """The node's full declared input-port list: explicit `input_ports` if
    set, else the catalog default. Distinct from `default_input_port`, which
    only returns the first one — the contract pass (`contracts.py`) needs
    the whole list to check required-input coverage."""
    if node.input_ports:
        return node.input_ports
    return _DEFAULT_PORT_CATALOG[node.type]["input"]


def output_ports_for(node: GraphNode) -> list[GraphPort]:
    """The node's full declared output-port list. See `input_ports_for`."""
    if node.output_ports:
        return node.output_ports
    return _DEFAULT_PORT_CATALOG[node.type]["output"]


def default_input_port(node: GraphNode) -> GraphPort | None:
    """The node's first declared input port, or the catalog default.
    `input`-type nodes have no input port (matching `compute_input` never
    reading upstream state today)."""
    ports = input_ports_for(node)
    return ports[0] if ports else None


def default_output_port(node: GraphNode) -> GraphPort | None:
    """The node's first declared output port, or the catalog default.
    `output`-type nodes have no output port. For `router`/`branch`, this is
    `passthrough` (listed first in `_router_like_io`), not `decision` — an
    edge with no explicit `source_port` must get the routed message."""
    ports = output_ports_for(node)
    return ports[0] if ports else None


def find_input_port(node: GraphNode, port_id: str) -> GraphPort | None:
    """The node's input port with this id, explicit or catalog-default, or
    `None` if no such port exists — used to validate an edge's explicit
    `target_port`."""
    return next((p for p in input_ports_for(node) if p.id == port_id), None)


def find_output_port(node: GraphNode, port_id: str) -> GraphPort | None:
    """The node's output port with this id. See `find_input_port`."""
    return next((p for p in output_ports_for(node) if p.id == port_id), None)


def resolve_node_input(
    node: GraphNode, input_port_id: str, state: dict[str, Any], graph: GraphDefinition
) -> Any:
    """Finds the first incoming edge (in declared order) bound to this
    node's `input_port_id` whose source has already produced a value, and
    returns that value from the edge's bound source port.

    An edge binds `input_port_id` when its explicit `target_port` matches,
    or — with no explicit `target_port` — when `input_port_id` is the
    target node's *default* input port (every current node type has exactly
    one input port, so this is the common case). Likewise an edge reads its
    source's explicit `source_port` when set, else the source's default
    output port. This generalizes Slice A's body (which always read the
    source's default output port) without changing its behavior for any
    edge that leaves `source_port`/`target_port` unset.
    """
    node_outputs = state.get("node_outputs", {})
    for edge in graph.edges:
        if edge.target != node.id:
            continue
        target_port_id = edge.target_port
        if target_port_id is None:
            default_port = default_input_port(node)
            target_port_id = default_port.id if default_port else None
        if target_port_id != input_port_id:
            continue
        source_outputs = node_outputs.get(edge.source)
        if not source_outputs:
            continue
        source_node = next((n for n in graph.nodes if n.id == edge.source), None)
        if edge.source_port:
            port_id = edge.source_port
        else:
            source_port = default_output_port(source_node) if source_node else None
            port_id = source_port.id if source_port else "output"
        if port_id in source_outputs:
            return source_outputs[port_id]
    return ""


def project_node_output(
    node: GraphNode, resolved_inputs: dict[str, Any], raw_output: Any
) -> dict[str, Any]:
    """Maps an executor's native return value onto the node's declared
    output ports.

    `router`/`branch` (when their output ports still carry the catalog's
    `passthrough`/`decision` ids — i.e. the author hasn't overridden
    `output_ports` with a different shape) split control from data: the
    node's own *resolved input* (looked up from `resolved_inputs` by its
    default input port id) goes to `passthrough` verbatim, and the
    executor's raw classification/selection dict goes to `decision`. This
    is the fix for `compute_llm` et al. previously reading a router's
    decision dict as if it were the routed message (design doc, "Router and
    branch: separating control from data").

    Every other node type — and a `router`/`branch` node with a custom
    `output_ports` override that doesn't use the `passthrough`/`decision`
    ids — keeps Slice A's default: a single output port, wrapping
    `raw_output` verbatim.

    `resolved_inputs` is `{input_port_id: value}` for the node's own input
    ports, as computed by the runtime.py call site via `resolve_node_input`.
    """
    output_ports = output_ports_for(node)
    if not output_ports:
        return {}
    port_ids = {p.id for p in output_ports}
    if node.type in _ROUTER_LIKE_TYPES and {"passthrough", "decision"} <= port_ids:
        input_port = default_input_port(node)
        passthrough_value = resolved_inputs.get(input_port.id, "") if input_port else ""
        return {"passthrough": passthrough_value, "decision": raw_output}
    return {output_ports[0].id: raw_output}


__all__ = [
    "input_ports_for",
    "output_ports_for",
    "default_input_port",
    "default_output_port",
    "find_input_port",
    "find_output_port",
    "resolve_node_input",
    "project_node_output",
]
