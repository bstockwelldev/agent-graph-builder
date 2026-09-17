"""Studio-consolidation Phase 2: `human_gate` pause/resume round-trip.

See docs/planning/features/studio-consolidation-plan.md — the largest item
in Phase 2 ("the first thing in AGB that makes a run non-atomic").
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.compiler import compile_graph
from app.main import app
from app.models import GraphDefinition, GraphEdge, GraphNode, NodePosition, NodeType
from app.runtime import (
    COMPILED_WORKFLOWS,
    get_run_node_traces,
    get_run_pause_state,
    get_run_summary,
    reject_run,
    resume_run_inline,
    start_run_inline,
)

client = TestClient(app)


def _single_gate_graph(graph_id: str = "graph_gate") -> GraphDefinition:
    input_node = GraphNode(
        id="input_1",
        type=NodeType.INPUT,
        position=NodePosition(x=0, y=0),
        config={"variableName": "question"},
    )
    gate = GraphNode(
        id="gate_1",
        type=NodeType.HUMAN_GATE,
        position=NodePosition(x=0, y=0),
        config={"content": "Approve?"},
    )
    output_node = GraphNode(
        id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={}
    )
    edges = [
        GraphEdge(id="e_input_gate", source="input_1", target="gate_1"),
        GraphEdge(id="e_gate_output", source="gate_1", target="output_1"),
    ]
    return GraphDefinition(
        id=graph_id,
        name="Gate",
        entry_node_id="input_1",
        nodes=[input_node, gate, output_node],
        edges=edges,
    )


def _two_gate_graph(graph_id: str = "graph_two_gates") -> GraphDefinition:
    input_node = GraphNode(
        id="input_1",
        type=NodeType.INPUT,
        position=NodePosition(x=0, y=0),
        config={"variableName": "question"},
    )
    gate1 = GraphNode(
        id="gate_1",
        type=NodeType.HUMAN_GATE,
        position=NodePosition(x=0, y=0),
        config={"content": "First approval"},
    )
    gate2 = GraphNode(
        id="gate_2",
        type=NodeType.HUMAN_GATE,
        position=NodePosition(x=0, y=0),
        config={"content": "Second approval"},
    )
    output_node = GraphNode(
        id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0), config={}
    )
    edges = [
        GraphEdge(id="e_input_gate1", source="input_1", target="gate_1"),
        GraphEdge(id="e_gate1_gate2", source="gate_1", target="gate_2"),
        GraphEdge(id="e_gate2_output", source="gate_2", target="output_1"),
    ]
    return GraphDefinition(
        id=graph_id,
        name="Two gates",
        entry_node_id="input_1",
        nodes=[input_node, gate1, gate2, output_node],
        edges=edges,
    )


@pytest.mark.asyncio
async def test_human_gate_pauses_then_resumes_to_success() -> None:
    graph = _single_gate_graph()
    compiled = compile_graph(graph, "cwf_gate")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_gate"] = graph

    run_id, _bus = await start_run_inline("cwf_gate", {"question": "hello"}, provider="stub")
    summary = get_run_summary(run_id)
    assert summary.status == "paused"
    assert summary.completed_at is not None

    pause = get_run_pause_state(run_id)
    assert pause is not None
    assert pause.paused_node_id == "gate_1"
    assert pause.node_outputs.get("input_1") == "hello"

    traces = {t.node_id: t for t in get_run_node_traces(run_id)}
    assert traces["gate_1"].status == "paused"
    assert "output_1" not in traces  # never reached before the pause

    result = await resume_run_inline(run_id)
    assert result is not None

    resumed_summary = get_run_summary(run_id)
    assert resumed_summary.status == "succeeded"
    assert resumed_summary.result == "hello"
    assert get_run_pause_state(run_id) is None

    resumed_traces = {t.node_id: t for t in get_run_node_traces(run_id)}
    assert resumed_traces["input_1"].output == "hello"
    assert resumed_traces["gate_1"].status == "succeeded"
    assert resumed_traces["output_1"].status == "succeeded"


@pytest.mark.asyncio
async def test_resuming_an_unpaused_run_is_a_noop() -> None:
    assert await resume_run_inline("run_does_not_exist") is None


@pytest.mark.asyncio
async def test_human_gate_reject_fails_the_run_without_resuming() -> None:
    graph = _single_gate_graph(graph_id="graph_gate_reject")
    compiled = compile_graph(graph, "cwf_gate_reject")
    assert compiled.ok
    COMPILED_WORKFLOWS["cwf_gate_reject"] = graph

    run_id, _bus = await start_run_inline("cwf_gate_reject", {"question": "hello"}, provider="stub")
    assert get_run_summary(run_id).status == "paused"

    rejected = reject_run(run_id, reason="No, thanks")
    assert rejected is True

    summary = get_run_summary(run_id)
    assert summary.status == "failed"
    assert summary.error == "No, thanks"
    assert get_run_pause_state(run_id) is None
    # Rejecting a second time is a no-op, not an error.
    assert reject_run(run_id) is False


@pytest.mark.asyncio
async def test_two_human_gates_pause_twice_and_resume_in_order() -> None:
    graph = _two_gate_graph()
    compiled = compile_graph(graph, "cwf_two_gates")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_two_gates"] = graph

    run_id, _bus = await start_run_inline("cwf_two_gates", {"question": "hi"}, provider="stub")
    assert get_run_summary(run_id).status == "paused"
    assert get_run_pause_state(run_id).paused_node_id == "gate_1"

    result = await resume_run_inline(run_id)
    assert result is not None
    assert get_run_summary(run_id).status == "paused"
    assert get_run_pause_state(run_id).paused_node_id == "gate_2"

    traces = {t.node_id: t for t in get_run_node_traces(run_id)}
    assert traces["gate_1"].status == "succeeded"  # resolved on the first resume, not re-paused
    assert traces["gate_2"].status == "paused"

    result = await resume_run_inline(run_id)
    assert result is not None
    final_summary = get_run_summary(run_id)
    assert final_summary.status == "succeeded"
    assert final_summary.result == "hi"


def test_resume_route_requires_a_pending_pause() -> None:
    response = client.post("/api/runs/run_never_existed/resume", json={"approve": True})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_resume_route_approve_and_reject(monkeypatch) -> None:
    # POST /api/runs/{id}/resume awaits inline only on Vercel (see main.py);
    # locally it fires-and-forgets like POST /api/runs does (see
    # test_vercel_run.py's "local run returns queued" for the same pattern).
    # Force the serverless path so this HTTP-level test can assert a
    # terminal status synchronously.
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(storage, "storage_is_healthy", lambda: True)

    graph = _single_gate_graph(graph_id="graph_gate_route")
    compiled = compile_graph(graph, "cwf_gate_route")
    assert compiled.ok
    COMPILED_WORKFLOWS["cwf_gate_route"] = graph
    run_id, _bus = await start_run_inline(
        "cwf_gate_route", {"question": "via route"}, provider="stub"
    )
    assert get_run_summary(run_id).status == "paused"

    response = client.post(f"/api/runs/{run_id}/resume", json={"approve": True})
    assert response.status_code == 200
    assert response.json()["status"] == "succeeded"
    assert response.json()["result"] == "via route"

    # Second call: nothing left to resume.
    response = client.post(f"/api/runs/{run_id}/resume", json={"approve": True})
    assert response.status_code == 404
