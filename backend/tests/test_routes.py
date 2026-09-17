"""Compile and route-fork tests using the offline stub provider (no Ollama)."""

from __future__ import annotations

import pytest

from app import runtime
from app.demo_graph import build_demo_graph
from app.models import EdgeKind, GraphDefinition, GraphEdge
from tests.helpers import run_graph_and_wait


@pytest.fixture
def demo_graph() -> GraphDefinition:
    return build_demo_graph()


@pytest.fixture
def compiled_demo(demo_graph: GraphDefinition) -> str:
    result = runtime.compile_workflow(demo_graph)
    assert result.ok, result.diagnostics
    assert result.compiled_workflow_id is not None
    return result.compiled_workflow_id


@pytest.mark.asyncio
async def test_demo_graph_compiles(demo_graph: GraphDefinition) -> None:
    result = runtime.compile_workflow(demo_graph)
    assert result.ok
    assert not any(d.blocking for d in result.diagnostics)


@pytest.mark.asyncio
async def test_technical_question_routes_to_tool(compiled_demo: str) -> None:
    run_id = await run_graph_and_wait(
        compiled_demo,
        "How does a database index work?",
    )
    traces = runtime.RUN_TRACES[run_id]
    executed = set(traces.keys())

    assert "tool_lookup" in executed
    assert traces["tool_lookup"].status == "succeeded"
    assert "llm_answer" not in executed


@pytest.mark.asyncio
async def test_non_technical_question_routes_to_llm_answer(compiled_demo: str) -> None:
    run_id = await run_graph_and_wait(
        compiled_demo,
        "What's a good pizza topping?",
    )
    traces = runtime.RUN_TRACES[run_id]
    executed = set(traces.keys())

    assert "llm_answer" in executed
    assert traces["llm_answer"].status == "succeeded"
    assert "tool_lookup" not in executed


def test_compile_rejects_cycle(demo_graph: GraphDefinition) -> None:
    cyclic = demo_graph.model_copy(
        update={
            "edges": [
                *demo_graph.edges,
                GraphEdge(
                    id="e_cycle",
                    source="output_1",
                    target="input_1",
                    kind=EdgeKind.SEQUENCE,
                ),
            ]
        }
    )
    result = runtime.compile_workflow(cyclic)
    assert not result.ok
    assert any(d.code == "GRAPH_INVALID_CYCLE" for d in result.diagnostics)


def test_compile_rejects_router_without_default(demo_graph: GraphDefinition) -> None:
    no_default = demo_graph.model_copy(
        update={
            "edges": [
                e
                for e in demo_graph.edges
                if not (e.source == "router_1" and e.kind == EdgeKind.DEFAULT)
            ]
        }
    )
    result = runtime.compile_workflow(no_default)
    assert not result.ok
    assert any(d.code == "ROUTER_MISSING_FALLBACK" for d in result.diagnostics)
