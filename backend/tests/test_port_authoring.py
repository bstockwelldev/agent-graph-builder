"""Port authoring (studio I/O tab): declaring a node's catalog ports with the
same ids keeps runtime behavior identical, while the declared contract is
enforced by validation."""

from __future__ import annotations

import pytest

from app import runtime
from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.models import EdgeTransform, GraphPort, PortContract, PortKind
from app.ports import accepts_any_kind, input_ports_for, output_ports_for


def _incoming_kinds(graph, node_id: str) -> set[PortKind]:
    nodes = {n.id: n for n in graph.nodes}
    kinds = set()
    for edge in graph.edges:
        if edge.target == node_id:
            source = nodes[edge.source]
            kinds.add(output_ports_for(source)[0].contract.kind)
    return kinds


def _declare_all(graph):
    """Every node's ports declared the way the studio seeds them: the catalog
    shape, with a kind-agnostic input typed by what actually arrives. Nodes
    whose incoming kinds disagree (the demo's output) stay inferred."""
    nodes = []
    for node in graph.nodes:
        inputs = [p.model_copy(deep=True) for p in input_ports_for(node)]
        if inputs and accepts_any_kind(node):
            kinds = _incoming_kinds(graph, node.id)
            if len(kinds) != 1:
                nodes.append(node)
                continue
            inputs[0].contract.kind = kinds.pop()
        update = {
            "input_ports": inputs or None,
            "output_ports": [p.model_copy() for p in output_ports_for(node)] or None,
        }
        nodes.append(node.model_copy(update=update))
    return graph.model_copy(update={"nodes": nodes})


@pytest.mark.asyncio
async def test_declaring_inferred_ports_changes_nothing_at_runtime() -> None:
    graph = _declare_all(build_demo_graph().model_copy(update={"id": "g_declared"}))
    assert not [d for d in validate_graph(graph) if d.blocking]
    compiled = runtime.compile_workflow(graph)
    run_id, bus = runtime.start_run(
        compiled.compiled_workflow_id,
        {"question": "How does a database index work?"},
        provider="stub",
    )
    async for _ in bus.stream():
        pass
    summary = runtime.RUN_STORE[run_id]
    assert summary.status == "succeeded", summary.error
    assert "index" in str(summary.result).lower()


def test_a_declared_kind_mismatch_blocks() -> None:
    graph = build_demo_graph()

    def port(port_id: str, direction: str, kind: PortKind) -> GraphPort:
        return GraphPort(
            id=port_id, name=port_id, direction=direction, contract=PortContract(kind=kind)
        )

    nodes = [
        node.model_copy(update={"output_ports": [port("output", "output", PortKind.MESSAGE)]})
        if node.id == "prompt_classify"
        else node.model_copy(
            update={"input_ports": [port("input", "input", PortKind.STRUCTURED_JSON)]}
        )
        if node.id == "llm_classify"
        else node
        for node in graph.nodes
    ]
    diagnostics = validate_graph(graph.model_copy(update={"nodes": nodes}))
    blocking = [d for d in diagnostics if d.code == "EDGE_CONTRACT_KIND_INCOMPATIBLE"]
    assert len(blocking) == 1 and blocking[0].node_id == "llm_classify" and blocking[0].blocking


def test_declaring_a_mixed_input_blocks_until_a_transform_converts() -> None:
    graph = build_demo_graph()
    declared = GraphPort(
        id="input", name="input", direction="input", contract=PortContract(kind=PortKind.MESSAGE)
    )
    tool = next(n for n in graph.nodes if n.id == "tool_lookup")
    nodes = [
        n.model_copy(update={"input_ports": [declared]})
        if n.id == "output_1"
        else n.model_copy(update={"output_ports": output_ports_for(tool)})
        if n.id == "tool_lookup"
        else n
        for n in graph.nodes
    ]
    typed = graph.model_copy(update={"nodes": nodes})
    blocking = [
        d.edge_id for d in validate_graph(typed) if d.code == "EDGE_CONTRACT_KIND_INCOMPATIBLE"
    ]
    assert blocking == ["e_tool_output"]

    edges = [
        e.model_copy(update={"transform": EdgeTransform(type="format_message", template="{value}")})
        if e.id == "e_tool_output"
        else e
        for e in typed.edges
    ]
    fixed = typed.model_copy(update={"edges": edges})
    assert not [d for d in validate_graph(fixed) if d.code == "EDGE_CONTRACT_KIND_INCOMPATIBLE"]
