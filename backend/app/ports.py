"""Shared port resolution/projection layer.

Part of the P0 graph foundation program
(docs/planning/features/p0-graph-foundation-design-plan.md), Slice A. Both
`compiler.py`'s future contract pass (Slice B) and `runtime.py`'s node runner
call into this module, so a validated port never diverges from what
execution actually does.

Slice A introduces the port *schema* (see `models.py`'s `GraphPort`/
`PortContract`) and a resolution/projection layer that is provably
behavior-identical to today's node-keyed dataflow for all twelve current node
types — every catalog entry below declares exactly one input port and one
output port, so resolution/projection can never be ambiguous. `router`/
`branch` output-port *wiring* (populating `passthrough`/`decision`
distinctly) is explicitly Slice B; this module still projects their raw
executor output onto a single default port in Slice A, matching current
behavior byte-for-byte. Declaring the second port now, before anything
populates it, would claim a runtime guarantee this slice doesn't enforce —
exactly what the design doc's Compatibility rules section forbids.
"""

from __future__ import annotations

from typing import Any

from .models import GraphDefinition, GraphNode, GraphPort, NodeType, PortContract, PortKind


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
    # Slice A: single output port only — see module docstring. Slice B adds
    # a second "decision" port here alongside the runtime wiring that
    # actually populates it.
    NodeType.ROUTER: _single_io(PortKind.MESSAGE, PortKind.MESSAGE),
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
    # Slice A: single output port only — see module docstring, same as ROUTER.
    NodeType.BRANCH: _single_io(PortKind.MESSAGE, PortKind.MESSAGE),
}


def default_input_port(node: GraphNode) -> GraphPort | None:
    """The node's first declared input port, or the catalog default.
    `input`-type nodes have no input port (matching `compute_input` never
    reading upstream state today)."""
    if node.input_ports:
        return node.input_ports[0]
    ports = _DEFAULT_PORT_CATALOG[node.type]["input"]
    return ports[0] if ports else None


def default_output_port(node: GraphNode) -> GraphPort | None:
    """The node's first declared output port, or the catalog default.
    `output`-type nodes have no output port."""
    if node.output_ports:
        return node.output_ports[0]
    ports = _DEFAULT_PORT_CATALOG[node.type]["output"]
    return ports[0] if ports else None


def resolve_node_input(
    node: GraphNode, input_port_id: str, state: dict[str, Any], graph: GraphDefinition
) -> Any:
    """Behavior-preserving replacement for the body of
    `nodes.get_upstream_output`. Finds the first incoming edge (in declared
    order) targeting this node whose source has already produced a value,
    and returns that value from the source's default output port.

    Every current node type has exactly one output port in Slice A's
    catalog, so this is provably equivalent to the old node-keyed
    `get_upstream_output`: "first source with a recorded output, in edge
    declaration order" is unchanged, just reading one extra dict level
    (the source's output-port id) per candidate.
    """
    node_outputs = state.get("node_outputs", {})
    for edge in graph.edges:
        if edge.target != node.id:
            continue
        source_outputs = node_outputs.get(edge.source)
        if not source_outputs:
            continue
        source_node = next((n for n in graph.nodes if n.id == edge.source), None)
        source_port = default_output_port(source_node) if source_node else None
        port_id = source_port.id if source_port else "output"
        if port_id in source_outputs:
            return source_outputs[port_id]
    return ""


def project_node_output(
    node: GraphNode, resolved_inputs: dict[str, Any], raw_output: Any
) -> dict[str, Any]:
    """Maps an executor's native return value onto the node's declared
    output ports. Slice A default for all twelve node types, including
    `router`/`branch`: a single output port, wrapping `raw_output` verbatim
    — exactly what `node_outputs[node.id] = output` did before this slice.
    `nodes.py` executors are unchanged; only this call site's write shape
    changes.

    `resolved_inputs` is accepted for a stable signature across Slice B
    (which needs it to build `router`/`branch`'s `passthrough` port) but is
    unused here — Slice A's runtime.py call site passes `{}` rather than
    computing it, since nothing in this slice reads it yet.
    """
    del resolved_inputs
    output_port = default_output_port(node)
    if output_port is None:
        return {}
    return {output_port.id: raw_output}


__all__ = [
    "default_input_port",
    "default_output_port",
    "resolve_node_input",
    "project_node_output",
]
