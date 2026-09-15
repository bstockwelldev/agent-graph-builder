"""Studio-consolidation Phase 2: guardrail/rubric/branch/tool_loop/code_exec
executor unit tests, run end-to-end through the demo graph's compile+run
seam with the stub provider.

See docs/planning/features/studio-consolidation-plan.md.
"""

from __future__ import annotations

import pytest

from app.compiler import compile_graph
from app.demo_graph import build_demo_graph
from app.models import EdgeKind, GraphEdge, GraphNode, NodePosition, NodeType
from app.runtime import COMPILED_WORKFLOWS, start_run_inline


def _graph_with_node_before_output(node: GraphNode) -> object:
    """Splices `node` between llm_answer and output_1 in the demo graph's
    non-technical branch, so a non-technical question flows through it."""
    demo = build_demo_graph()
    edges = []
    for edge in demo.edges:
        if edge.id == "e_llmanswer_output":
            edges.append(GraphEdge(id="e_llmanswer_gate", source="llm_answer", target=node.id))
            edges.append(GraphEdge(id=f"e_{node.id}_output", source=node.id, target="output_1"))
            continue
        edges.append(edge)
    return demo.model_copy(update={"nodes": [*demo.nodes, node], "edges": edges})


async def _run_non_technical(graph, question: str = "What's a good pizza topping?"):
    compiled = compile_graph(graph, "cwf_test")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_test"] = graph
    run_id, _bus = await start_run_inline("cwf_test", {"question": question}, provider="stub")
    from app.runtime import get_run_summary

    return get_run_summary(run_id)


@pytest.mark.asyncio
async def test_guardrail_passes_clean_text() -> None:
    node = GraphNode(
        id="guard_1", type=NodeType.GUARDRAIL, position=NodePosition(x=0, y=0), config={}
    )
    graph = _graph_with_node_before_output(node)
    summary = await _run_non_technical(graph)
    assert summary.status == "succeeded"


@pytest.mark.asyncio
async def test_guardrail_blocks_url_by_default() -> None:
    node = GraphNode(
        id="guard_1", type=NodeType.GUARDRAIL, position=NodePosition(x=0, y=0), config={}
    )
    graph = _graph_with_node_before_output(node)
    summary = await _run_non_technical(graph, question="See https://example.com for toppings")
    assert summary.status == "failed"
    assert "URL" in summary.error


@pytest.mark.asyncio
async def test_guardrail_allows_url_when_configured() -> None:
    node = GraphNode(
        id="guard_1",
        type=NodeType.GUARDRAIL,
        position=NodePosition(x=0, y=0),
        config={"allowUrls": True},
    )
    graph = _graph_with_node_before_output(node)
    summary = await _run_non_technical(graph, question="See https://example.com for toppings")
    assert summary.status == "succeeded"


@pytest.mark.asyncio
async def test_rubric_passes_through_findings_without_failing_by_default() -> None:
    node = GraphNode(
        id="rubric_1", type=NodeType.RUBRIC, position=NodePosition(x=0, y=0), config={}
    )
    graph = _graph_with_node_before_output(node)
    summary = await _run_non_technical(graph)
    assert summary.status == "succeeded"


@pytest.mark.asyncio
async def test_rubric_blocks_on_findings_when_configured() -> None:
    # Stub's non-classifier answer for a long question echoes an ellipsis-
    # truncated snippet; force a finding deterministically via a template
    # placeholder left in the prompt feeding the rubric node instead.
    demo = build_demo_graph()
    nodes = [
        n
        if n.id != "prompt_answer"
        else n.model_copy(update={"config": {"template": "{unresolved_var}"}})
        for n in demo.nodes
    ]
    rubric_node = GraphNode(
        id="rubric_1",
        type=NodeType.RUBRIC,
        position=NodePosition(x=0, y=0),
        config={"rubricFailOnFindings": True},
    )
    edges = [e for e in demo.edges if e.id not in ("e_answerprompt_llm",)]
    edges.append(GraphEdge(id="e_answerprompt_rubric", source="prompt_answer", target="rubric_1"))
    edges.append(GraphEdge(id="e_rubric_llm", source="rubric_1", target="llm_answer"))
    graph = demo.model_copy(update={"nodes": [*nodes, rubric_node], "edges": edges})

    summary = await _run_non_technical(graph)
    assert summary.status == "failed"
    assert "rubric findings" in summary.error


@pytest.mark.asyncio
async def test_branch_matched_takes_conditional_edge() -> None:
    demo = build_demo_graph()
    branch = GraphNode(
        id="branch_1",
        type=NodeType.BRANCH,
        position=NodePosition(x=0, y=0),
        config={"content": "pizza"},
    )
    matched_output = GraphNode(
        id="matched_output", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={}
    )
    edges = [e for e in demo.edges if e.id != "e_llmanswer_output"]
    edges.append(GraphEdge(id="e_llmanswer_branch", source="llm_answer", target="branch_1"))
    edges.append(
        GraphEdge(
            id="e_branch_matched",
            source="branch_1",
            target="matched_output",
            kind=EdgeKind.CONDITIONAL,
            condition="stub",
        )
    )
    edges.append(
        GraphEdge(
            id="e_branch_default", source="branch_1", target="output_1", kind=EdgeKind.DEFAULT
        )
    )
    graph = demo.model_copy(update={"nodes": [*demo.nodes, branch, matched_output], "edges": edges})

    compiled = compile_graph(graph, "cwf_branch")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_branch"] = graph
    run_id, _bus = await start_run_inline(
        "cwf_branch", {"question": "pizza toppings?"}, provider="stub"
    )
    from app.runtime import get_run_node_traces, get_run_summary

    summary = get_run_summary(run_id)
    assert summary.status == "succeeded"
    traces = {t.node_id: t for t in get_run_node_traces(run_id)}
    assert "matched_output" in traces
    assert "output_1" not in traces


@pytest.mark.asyncio
async def test_branch_no_match_falls_back_to_default() -> None:
    demo = build_demo_graph()
    branch = GraphNode(
        id="branch_1",
        type=NodeType.BRANCH,
        position=NodePosition(x=0, y=0),
        config={"content": "not-in-the-output"},
    )
    matched_output = GraphNode(
        id="matched_output", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={}
    )
    edges = [e for e in demo.edges if e.id != "e_llmanswer_output"]
    edges.append(GraphEdge(id="e_llmanswer_branch", source="llm_answer", target="branch_1"))
    edges.append(
        GraphEdge(
            id="e_branch_matched",
            source="branch_1",
            target="matched_output",
            kind=EdgeKind.CONDITIONAL,
            condition="not-in-the-output",
        )
    )
    edges.append(
        GraphEdge(
            id="e_branch_default", source="branch_1", target="output_1", kind=EdgeKind.DEFAULT
        )
    )
    graph = demo.model_copy(update={"nodes": [*demo.nodes, branch, matched_output], "edges": edges})

    compiled = compile_graph(graph, "cwf_branch_default")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_branch_default"] = graph
    run_id, _bus = await start_run_inline(
        "cwf_branch_default", {"question": "pizza toppings?"}, provider="stub"
    )
    from app.runtime import get_run_node_traces, get_run_summary

    summary = get_run_summary(run_id)
    assert summary.status == "succeeded"
    traces = {t.node_id: t for t in get_run_node_traces(run_id)}
    assert "output_1" in traces
    assert "matched_output" not in traces


@pytest.mark.asyncio
async def test_code_exec_passes_through_without_executing() -> None:
    node = GraphNode(
        id="code_1",
        type=NodeType.CODE_EXEC,
        position=NodePosition(x=0, y=0),
        config={"content": "print('hi')", "codeExecLanguage": "python"},
    )
    graph = _graph_with_node_before_output(node)
    summary = await _run_non_technical(graph)
    assert summary.status == "succeeded"


@pytest.mark.asyncio
async def test_tool_loop_calls_lookup_topic_then_returns_final_answer() -> None:
    demo = build_demo_graph()
    loop_node = GraphNode(
        id="loop_1",
        type=NodeType.TOOL_LOOP,
        position=NodePosition(x=0, y=0),
        config={"model": "stub", "maxToolIterations": 4},
    )
    input_node = GraphNode(
        id="input_1",
        type=NodeType.INPUT,
        position=NodePosition(x=0, y=0),
        config={"variableName": "question"},
    )
    output_node = GraphNode(
        id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={}
    )
    edges = [
        GraphEdge(id="e_input_loop", source="input_1", target="loop_1"),
        GraphEdge(id="e_loop_output", source="loop_1", target="output_1"),
    ]
    graph = demo.model_copy(
        update={
            "id": "graph_tool_loop",
            "nodes": [input_node, loop_node, output_node],
            "edges": edges,
            "entry_node_id": "input_1",
        }
    )

    compiled = compile_graph(graph, "cwf_tool_loop")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_tool_loop"] = graph
    run_id, _bus = await start_run_inline(
        "cwf_tool_loop", {"question": "how does a database index work?"}, provider="stub"
    )
    from app.runtime import get_run_node_traces, get_run_summary

    summary = get_run_summary(run_id)
    assert summary.status == "succeeded"
    trace = next(t for t in get_run_node_traces(run_id) if t.node_id == "loop_1")
    tool_calls = [
        entry for entry in trace.input["transcript"] if entry.get("toolCall") == "lookup_topic"
    ]
    assert tool_calls, trace.input["transcript"]
    assert "index" in summary.result.lower()


@pytest.mark.asyncio
async def test_tool_loop_falls_back_to_final_answer_for_non_technical_question() -> None:
    demo = build_demo_graph()
    loop_node = GraphNode(
        id="loop_1",
        type=NodeType.TOOL_LOOP,
        position=NodePosition(x=0, y=0),
        config={"model": "stub", "maxToolIterations": 4},
    )
    input_node = GraphNode(
        id="input_1",
        type=NodeType.INPUT,
        position=NodePosition(x=0, y=0),
        config={"variableName": "question"},
    )
    output_node = GraphNode(
        id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={}
    )
    edges = [
        GraphEdge(id="e_input_loop", source="input_1", target="loop_1"),
        GraphEdge(id="e_loop_output", source="loop_1", target="output_1"),
    ]
    graph = demo.model_copy(
        update={
            "id": "graph_tool_loop_2",
            "nodes": [input_node, loop_node, output_node],
            "edges": edges,
            "entry_node_id": "input_1",
        }
    )

    compiled = compile_graph(graph, "cwf_tool_loop_2")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_tool_loop_2"] = graph
    run_id, _bus = await start_run_inline(
        "cwf_tool_loop_2", {"question": "what's a good pizza topping?"}, provider="stub"
    )
    from app.runtime import get_run_summary

    summary = get_run_summary(run_id)
    assert summary.status == "succeeded"
    assert summary.result.startswith("[stub answer]")
