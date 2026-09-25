"""P0 graph foundation, Slice B: contract validation pass."""

from __future__ import annotations

from app.compiler import validate_graph
from app.contracts import validate_contracts
from app.demo_graph import build_demo_graph
from app.models import (
    EdgeKind,
    EdgeTransform,
    GraphEdge,
    GraphNode,
    GraphPort,
    NodePosition,
    NodeType,
    PortContract,
    PortKind,
)


def test_demo_graph_has_no_blocking_contract_diagnostics() -> None:
    graph = build_demo_graph()
    diagnostics = validate_contracts(graph)
    assert not any(d.blocking for d in diagnostics), diagnostics


def test_demo_graph_has_no_inferred_kind_mismatches() -> None:
    """`tool` reads its argument from a state variable and `output` passes
    whatever arrives through, so their default inputs accept any kind: the
    router -> tool and tool -> output edges used to warn with no node
    setting that could resolve it (incidents/demo-graph-contract-warnings)."""
    diagnostics = validate_contracts(build_demo_graph())
    assert [d for d in diagnostics if d.code == "CONTRACT_KIND_INFERRED_MISMATCH"] == []


def test_inferred_kind_mismatch_still_warns_for_consuming_nodes() -> None:
    """`code_exec` does consume its structured-json input, so a message feed
    into its default port still warns (non-blocking)."""
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    code_node = GraphNode(
        id="code_1", type=NodeType.CODE_EXEC, position=NodePosition(x=0, y=0), config={}
    )
    rewired = graph.model_copy(
        update={
            "nodes": [*graph.nodes, code_node],
            "edges": [
                *graph.edges,
                GraphEdge(id="e_code", source=llm_node.id, target="code_1", kind=EdgeKind.SEQUENCE),
            ],
        }
    )
    inferred = [
        d for d in validate_contracts(rewired) if d.code == "CONTRACT_KIND_INFERRED_MISMATCH"
    ]
    assert [d.edge_id for d in inferred] == ["e_code"]
    assert inferred[0].severity == "warning" and not inferred[0].blocking


def test_compile_graph_still_reports_ok_for_demo_graph() -> None:
    """End-to-end via compiler.validate_graph (what /validate and /compile
    actually call) — contract diagnostics are additive and never regress
    the exit-gate guarantee that the demo graph still compiles clean."""
    graph = build_demo_graph()
    diagnostics = validate_graph(graph)
    assert not any(d.blocking for d in diagnostics), diagnostics


def _explicit_port(port_id: str, kind: PortKind, direction: str = "output") -> GraphPort:
    return GraphPort(
        id=port_id, name=port_id, direction=direction, contract=PortContract(kind=kind)
    )


def test_explicit_kind_mismatch_blocks() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    tool_node = next(n for n in graph.nodes if n.type == NodeType.TOOL)
    llm_with_explicit_output = llm_node.model_copy(
        update={"output_ports": [_explicit_port("output", PortKind.MESSAGE, "output")]}
    )
    tool_with_explicit_input = tool_node.model_copy(
        update={"input_ports": [_explicit_port("input", PortKind.STRUCTURED_JSON, "input")]}
    )
    rewired = graph.model_copy(
        update={
            "nodes": [
                llm_with_explicit_output
                if n.id == llm_node.id
                else tool_with_explicit_input
                if n.id == tool_node.id
                else n
                for n in graph.nodes
            ],
            "edges": [
                *graph.edges,
                GraphEdge(
                    id="e_extra", source=llm_node.id, target=tool_node.id, kind=EdgeKind.SEQUENCE
                ),
            ],
        }
    )
    diagnostics = validate_contracts(rewired)
    blocking = [d for d in diagnostics if d.edge_id == "e_extra"]
    assert any(d.code == "EDGE_CONTRACT_KIND_INCOMPATIBLE" and d.blocking for d in blocking)


def test_message_target_accepts_non_message_source_with_format_message_transform() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    tool_node = next(n for n in graph.nodes if n.type == NodeType.TOOL)
    llm_with_explicit_input = llm_node.model_copy(
        update={"input_ports": [_explicit_port("input", PortKind.MESSAGE, "input")]}
    )
    tool_with_explicit_output = tool_node.model_copy(
        update={"output_ports": [_explicit_port("output", PortKind.TOOL_RESULT, "output")]}
    )
    rewired = graph.model_copy(
        update={
            "nodes": [
                llm_with_explicit_input
                if n.id == llm_node.id
                else tool_with_explicit_output
                if n.id == tool_node.id
                else n
                for n in graph.nodes
            ],
            "edges": [
                *graph.edges,
                GraphEdge(
                    id="e_extra",
                    source=tool_node.id,
                    target=llm_node.id,
                    kind=EdgeKind.SEQUENCE,
                    transform=EdgeTransform(type="format_message", template="{value}"),
                ),
            ],
        }
    )
    diagnostics = validate_contracts(rewired)
    assert not any(
        d.edge_id == "e_extra" and d.code == "EDGE_CONTRACT_KIND_INCOMPATIBLE" for d in diagnostics
    )


def test_edge_source_port_not_found() -> None:
    graph = build_demo_graph()
    edge = graph.edges[0]
    rewired = graph.model_copy(
        update={
            "edges": [
                e.model_copy(update={"source_port": "does_not_exist"}) if e.id == edge.id else e
                for e in graph.edges
            ]
        }
    )
    diagnostics = validate_contracts(rewired)
    assert any(d.code == "EDGE_SOURCE_PORT_NOT_FOUND" and d.blocking for d in diagnostics)


def test_edge_target_port_not_found() -> None:
    graph = build_demo_graph()
    edge = graph.edges[0]
    rewired = graph.model_copy(
        update={
            "edges": [
                e.model_copy(update={"target_port": "does_not_exist"}) if e.id == edge.id else e
                for e in graph.edges
            ]
        }
    )
    diagnostics = validate_contracts(rewired)
    assert any(d.code == "EDGE_TARGET_PORT_NOT_FOUND" and d.blocking for d in diagnostics)


def test_edge_port_direction_invalid() -> None:
    """An explicit source_port that names a real port id on the node, but
    that port's own `direction` field says "input" — a malformed author
    declaration, not a missing port."""
    graph = build_demo_graph()
    router_node = next(n for n in graph.nodes if n.type == NodeType.ROUTER)
    misdirected = router_node.model_copy(
        update={"output_ports": [_explicit_port("weird", PortKind.MESSAGE, direction="input")]}
    )
    edge = next(e for e in graph.edges if e.source == router_node.id)
    rewired = graph.model_copy(
        update={
            "nodes": [misdirected if n.id == router_node.id else n for n in graph.nodes],
            "edges": [
                e.model_copy(update={"source_port": "weird"}) if e.id == edge.id else e
                for e in graph.edges
            ],
        }
    )
    diagnostics = validate_contracts(rewired)
    assert any(d.code == "EDGE_PORT_DIRECTION_INVALID" and d.blocking for d in diagnostics)


def test_edge_transform_invalid_missing_required_field() -> None:
    graph = build_demo_graph()
    edge = graph.edges[0]
    rewired = graph.model_copy(
        update={
            "edges": [
                e.model_copy(update={"transform": EdgeTransform(type="select")})
                if e.id == edge.id
                else e
                for e in graph.edges
            ]
        }
    )
    diagnostics = validate_contracts(rewired)
    assert any(
        d.code == "EDGE_TRANSFORM_INVALID" and d.edge_id == edge.id and d.blocking
        for d in diagnostics
    )


def test_node_required_input_unbound_for_non_entry_node() -> None:
    graph = build_demo_graph()
    extra_node = GraphNode(id="orphan", type=NodeType.PROMPT, position=NodePosition(x=0, y=0))
    added = graph.model_copy(update={"nodes": [*graph.nodes, extra_node]})
    diagnostics = validate_contracts(added)
    assert any(
        d.code == "NODE_REQUIRED_INPUT_UNBOUND" and d.node_id == "orphan" and d.blocking
        for d in diagnostics
    )


def test_entry_node_required_input_never_flagged() -> None:
    """The entry node has no incoming edge by definition; Slice B must not
    demand one even when its catalog default input is `required=True`."""
    graph = build_demo_graph()
    diagnostics = validate_contracts(graph)
    assert not any(
        d.code == "NODE_REQUIRED_INPUT_UNBOUND" and d.node_id == graph.entry_node_id
        for d in diagnostics
    )


def test_ambiguous_binding_from_two_independent_plain_edges() -> None:
    """Two plain sequence edges from unrelated sources into the same input
    port have no runtime exclusivity guarantee — must block. `llm_classify`
    sits upstream of router_1 (not exclusive to either of its branches), so
    this doesn't perturb the demo graph's other, legitimately-exempt
    convergence at output_1 (see the exemption test below)."""
    graph = build_demo_graph()
    llm_answer = next(n for n in graph.nodes if n.id == "llm_answer")
    extra_edge = GraphEdge(
        id="e_extra", source="llm_classify", target=llm_answer.id, kind=EdgeKind.SEQUENCE
    )
    added = graph.model_copy(update={"edges": [*graph.edges, extra_edge]})
    diagnostics = validate_contracts(added)
    ambiguous = [d for d in diagnostics if d.code == "NODE_INPUT_PORT_AMBIGUOUS_BINDING"]
    assert ambiguous, diagnostics
    assert all(d.blocking for d in ambiguous)
    assert {d.edge_id for d in ambiguous} == {"e_extra", "e_answerprompt_llm"}
    # The pre-existing, legitimately-exempt convergence at output_1 must be
    # unaffected by this unrelated addition.
    assert not any(d.node_id == "output_1" for d in ambiguous)


def test_demo_graph_converging_output_edges_are_exempt_as_branch_exclusive() -> None:
    """output_1 has two incoming edges (from tool_lookup and llm_answer),
    each two hops downstream of router_1's two mutually exclusive branches
    — not literal router siblings, but exclusive by construction. Slice B's
    reachability-based exclusivity check must not flag this (the demo graph
    has always had this exact shape)."""
    graph = build_demo_graph()
    diagnostics = validate_contracts(graph)
    assert not any(d.code == "NODE_INPUT_PORT_AMBIGUOUS_BINDING" for d in diagnostics)


def test_contract_schema_unknown_warns_when_source_has_no_schema() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    tool_node = next(n for n in graph.nodes if n.type == NodeType.TOOL)
    tool_with_schema_input = tool_node.model_copy(
        update={
            "input_ports": [
                GraphPort(
                    id="input",
                    name="input",
                    direction="input",
                    contract=PortContract(kind=PortKind.STRUCTURED_JSON, schema={"type": "object"}),
                )
            ]
        }
    )
    rewired = graph.model_copy(
        update={
            "nodes": [tool_with_schema_input if n.id == tool_node.id else n for n in graph.nodes],
            "edges": [
                *graph.edges,
                GraphEdge(
                    id="e_extra", source=llm_node.id, target=tool_node.id, kind=EdgeKind.SEQUENCE
                ),
            ],
        }
    )
    diagnostics = validate_contracts(rewired)
    assert any(
        d.code == "CONTRACT_SCHEMA_UNKNOWN" and d.edge_id == "e_extra" and not d.blocking
        for d in diagnostics
    )


def test_edge_schema_incompatible_type_mismatch() -> None:
    graph = build_demo_graph()
    llm_node = next(n for n in graph.nodes if n.type == NodeType.LLM)
    tool_node = next(n for n in graph.nodes if n.type == NodeType.TOOL)
    llm_with_schema_output = llm_node.model_copy(
        update={
            "output_ports": [
                GraphPort(
                    id="output",
                    name="output",
                    direction="output",
                    contract=PortContract(kind=PortKind.STRUCTURED_JSON, schema={"type": "string"}),
                )
            ]
        }
    )
    tool_with_schema_input = tool_node.model_copy(
        update={
            "input_ports": [
                GraphPort(
                    id="input",
                    name="input",
                    direction="input",
                    contract=PortContract(kind=PortKind.STRUCTURED_JSON, schema={"type": "object"}),
                )
            ]
        }
    )
    rewired = graph.model_copy(
        update={
            "nodes": [
                llm_with_schema_output
                if n.id == llm_node.id
                else tool_with_schema_input
                if n.id == tool_node.id
                else n
                for n in graph.nodes
            ],
            "edges": [
                *graph.edges,
                GraphEdge(
                    id="e_extra", source=llm_node.id, target=tool_node.id, kind=EdgeKind.SEQUENCE
                ),
            ],
        }
    )
    diagnostics = validate_contracts(rewired)
    assert any(
        d.code == "EDGE_SCHEMA_INCOMPATIBLE" and d.edge_id == "e_extra" and d.blocking
        for d in diagnostics
    )
