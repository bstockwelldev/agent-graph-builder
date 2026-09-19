"""P0 graph foundation: port catalog + resolution/projection layer
(Slice A base, Slice B router/branch passthrough/decision wiring)."""

from __future__ import annotations

import pytest

from app.demo_graph import build_demo_graph
from app.models import GraphPort, NodeType, PortContract, PortKind
from app.ports import (
    default_input_port,
    default_output_port,
    find_input_port,
    find_output_port,
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
    # port-keyed shape, under each node's own default output port id
    # (router/branch's is "passthrough" since Slice B, not "output").
    state = {
        "node_outputs": {
            n.id: {default_output_port(n).id: f"value-from-{n.id}"}
            for n in graph.nodes
            if default_output_port(n) is not None
        }
    }
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


def test_resolve_node_input_honors_explicit_source_port() -> None:
    """Slice B: an edge with an explicit source_port reads that named port
    instead of the source's default — e.g. an audit consumer of a router's
    decision object rather than its routed message."""
    graph = build_demo_graph()
    router_node = next(n for n in graph.nodes if n.type == NodeType.ROUTER)
    downstream = next(e.target for e in graph.edges if e.source == router_node.id)
    downstream_node = next(n for n in graph.nodes if n.id == downstream)
    rewired = graph.model_copy(
        update={
            "edges": [
                e.model_copy(update={"source_port": "decision"}) if e.target == downstream else e
                for e in graph.edges
            ]
        }
    )
    state = {
        "node_outputs": {
            router_node.id: {"passthrough": "the message", "decision": {"classification": "x"}}
        }
    }
    value = resolve_node_input(
        downstream_node, default_input_port(downstream_node).id, state, rewired
    )
    assert value == {"classification": "x"}


def test_find_input_and_output_port_by_id() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    assert find_input_port(llm_node, "input") is not None
    assert find_input_port(llm_node, "does_not_exist") is None
    assert find_output_port(llm_node, "output") is not None
    assert find_output_port(llm_node, "does_not_exist") is None

    router_node = next(n for n in graph.nodes if n.type == NodeType.ROUTER)
    assert find_output_port(router_node, "passthrough") is not None
    assert find_output_port(router_node, "decision") is not None


_ROUTER_LIKE = {NodeType.ROUTER, NodeType.BRANCH}


@pytest.mark.parametrize("node_type", [t for t in NodeType if t not in _ROUTER_LIKE])
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


@pytest.mark.parametrize("node_type", sorted(_ROUTER_LIKE, key=lambda t: t.value))
def test_project_node_output_splits_router_like_into_passthrough_and_decision(
    node_type: NodeType,
) -> None:
    """Slice B: router/branch split control (the classification/selection
    dict) from data (the node's own resolved input, verbatim) onto two
    named output ports — the fix for downstream nodes previously reading a
    router's decision dict as if it were the routed message."""
    graph = build_demo_graph()
    node = next((n for n in graph.nodes if n.type == node_type), None)
    if node is None:
        from app.models import GraphNode, NodePosition

        node = GraphNode(id="synthetic", type=node_type, position=NodePosition(x=0, y=0))
    raw_output = {"classification": "technical", "rationale": "x"}
    resolved_inputs = {"input": "the routed message"}

    projected = project_node_output(node, resolved_inputs, raw_output)

    assert projected == {"passthrough": "the routed message", "decision": raw_output}
    # An edge with no explicit source_port must default to the routed
    # message, not the decision dict.
    assert default_output_port(node).id == "passthrough"


def test_project_node_output_falls_back_to_single_port_for_custom_router_output_ports() -> None:
    """An author-overridden output_ports list that doesn't use the
    passthrough/decision ids gets Slice A's plain single-port wrap — Slice
    B's dual projection only applies to the catalog's own port ids."""
    graph = build_demo_graph()
    router_node = next(n for n in graph.nodes if n.type == NodeType.ROUTER)
    custom_port = GraphPort(
        id="result", name="result", direction="output", contract=PortContract(kind=PortKind.MESSAGE)
    )
    overridden = router_node.model_copy(update={"output_ports": [custom_port]})
    raw_output = {"classification": "technical"}

    projected = project_node_output(overridden, {"input": "msg"}, raw_output)

    assert projected == {"result": raw_output}
