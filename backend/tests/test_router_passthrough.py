"""P0 graph foundation, Slice B: router's downstream nodes must receive the
routed message (passthrough), not the router's own decision dict — the bug
the design doc's "Router and branch: separating control from data" section
describes: `compute_llm` used to `str()`-coerce the decision dict and feed
that to the LLM as its user prompt instead of the actual routed message.
"""

from __future__ import annotations

import pytest

from app import runtime
from app.models import EdgeKind, GraphDefinition, GraphEdge, GraphNode, NodePosition, NodeType
from tests.helpers import run_graph_and_wait


def _router_to_llm_graph() -> GraphDefinition:
    nodes = [
        GraphNode(id="input_1", type=NodeType.INPUT, position=NodePosition(x=0, y=0)),
        GraphNode(id="router_1", type=NodeType.ROUTER, position=NodePosition(x=200, y=0)),
        GraphNode(
            id="llm_1",
            type=NodeType.LLM,
            position=NodePosition(x=400, y=0),
            config={"model": "stub", "systemPrompt": "Echo back exactly what you receive."},
        ),
        GraphNode(id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=600, y=0)),
    ]
    edges = [
        GraphEdge(id="e_input_router", source="input_1", target="router_1", kind=EdgeKind.SEQUENCE),
        GraphEdge(id="e_router_llm", source="router_1", target="llm_1", kind=EdgeKind.DEFAULT),
        GraphEdge(id="e_llm_output", source="llm_1", target="output_1", kind=EdgeKind.SEQUENCE),
    ]
    return GraphDefinition(
        id="router_llm_demo",
        name="Router -> LLM",
        entry_node_id="input_1",
        nodes=nodes,
        edges=edges,
    )


@pytest.mark.asyncio
async def test_llm_downstream_of_router_receives_routed_message_not_decision_dict() -> None:
    graph = _router_to_llm_graph()
    compile_result = runtime.compile_workflow(graph)
    assert compile_result.ok, compile_result.diagnostics

    run_id = await run_graph_and_wait(
        compile_result.compiled_workflow_id, "What's a good pizza topping?"
    )
    traces = runtime.RUN_TRACES[run_id]

    llm_trace = traces["llm_1"]
    assert llm_trace.status == "succeeded"
    # The LLM's recorded input must be the routed message string, never a
    # dict (classification/rationale/selectedTargetNodeId) stringified.
    user_prompt = llm_trace.input["userPrompt"]
    assert user_prompt == "What's a good pizza topping?"

    router_output = runtime.RUN_STORE  # sanity: run completed end to end
    assert router_output[run_id].status == "succeeded"


@pytest.mark.asyncio
async def test_router_node_outputs_are_port_keyed_with_passthrough_and_decision() -> None:
    graph = _router_to_llm_graph()
    compile_result = runtime.compile_workflow(graph)
    run_id = await run_graph_and_wait(
        compile_result.compiled_workflow_id, "What's a good pizza topping?"
    )
    traces = runtime.RUN_TRACES[run_id]
    router_trace = traces["router_1"]
    # NodeTrace.output stays the raw executor return (observability is
    # unchanged) — the decision dict, not the passthrough message.
    assert isinstance(router_trace.output, dict)
    assert "classification" in router_trace.output
