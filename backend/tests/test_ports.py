"""P0 graph foundation, Slice A: port catalog + resolution/projection layer."""

from __future__ import annotations

import pytest

from app.demo_graph import build_demo_graph
from app.models import GraphPort, NodeType, PortContract, PortKind
from app.ports import (
    default_input_port,
    default_output_port,
    project_node_output,
    resolve_node_input,
)


def _old_get_upstream_output(node, state, graph):
    """The pre-Slice-A node-keyed lookup this module replaces, kept here
    only to prove equivalence against the new port-keyed resolver."""
    candidate_sources = [e.source for e in graph.edges if e.target == node.id]
    for source_id in candidate_sources:
        if source_id in state["node_outputs"]:
            return state["node_outputs"][source_id]
    return ""


def test_catalog_covers_every_node_type() -> None:
    from app.ports import _DEFAULT_PORT_CATALOG

    for node_type in NodeType:
        assert node_type in _DEFAULT_PORT_CATALOG, f"missing port catalog entry for {node_type}"


def test_default_input_port_uses_catalog_when_not_explicit() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    port = default_input_port(llm_node)
    assert port is not None
    assert port.id == "input"
    assert port.contract.kind == PortKind.MESSAGE


def test_default_input_port_prefers_explicit_node_ports() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    custom_port = GraphPort(
        id="custom_in",
        name="custom",
        direction="input",
        contract=PortContract(kind=PortKind.STRUCTURED_JSON),
    )
    with_explicit = llm_node.model_copy(update={"input_ports": [custom_port]})
    assert default_input_port(with_explicit) is custom_port


def test_input_node_has_no_input_port() -> None:
    graph = build_demo_graph()
    input_node = next(n for n in graph.nodes if n.type == NodeType.INPUT)
    assert default_input_port(input_node) is None
    assert default_output_port(input_node) is not None


def test_output_node_has_no_output_port() -> None:
    graph = build_demo_graph()
    output_node = next(n for n in graph.nodes if n.type == NodeType.OUTPUT)
    assert default_output_port(output_node) is None
    assert default_input_port(output_node) is not None


def test_resolve_node_input_matches_old_get_upstream_output() -> None:
    graph = build_demo_graph()
    # Simulate every node having already produced a value, in the new
    # port-keyed shape.
    state = {"node_outputs": {n.id: {"output": f"value-from-{n.id}"} for n in graph.nodes}}
    old_state = {"node_outputs": {n.id: f"value-from-{n.id}" for n in graph.nodes}}

    for node in graph.nodes:
        input_port = default_input_port(node)
        if input_port is None:
            continue
        new_value = resolve_node_input(node, input_port.id, state, graph)
        old_value = _old_get_upstream_output(node, old_state, graph)
        assert new_value == old_value, f"mismatch for node {node.id}"


def test_resolve_node_input_returns_empty_string_when_nothing_upstream_yet() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    value = resolve_node_input(llm_node, "input", {"node_outputs": {}}, graph)
    assert value == ""


@pytest.mark.parametrize("node_type", list(NodeType))
def test_project_node_output_wraps_verbatim(node_type: NodeType) -> None:
    graph = build_demo_graph()
    node = next((n for n in graph.nodes if n.type == node_type), None)
    if node is None:
        # Not every NodeType appears in the demo graph; build a bare node
        # of this type just to exercise the catalog default.
        from app.models import GraphNode, NodePosition

        node = GraphNode(id="synthetic", type=node_type, position=NodePosition(x=0, y=0))

    raw_output = {"anything": "goes"}
    projected = project_node_output(node, {}, raw_output)

    output_port = default_output_port(node)
    if output_port is None:
        assert projected == {}
    else:
        assert projected == {output_port.id: raw_output}


def test_router_and_branch_output_is_still_single_key_in_slice_a() -> None:
    """Guard test: Slice B splits router/branch output into passthrough +
    decision ports. Until that lands, Slice A must keep projecting a single
    key so it never claims a runtime guarantee it doesn't enforce."""
    graph = build_demo_graph()
    router_node = next(n for n in graph.nodes if n.type == NodeType.ROUTER)
    projected = project_node_output(
        router_node, {}, {"classification": "technical", "rationale": "x"}
    )
    assert len(projected) == 1
    assert set(projected) == {"output"}
