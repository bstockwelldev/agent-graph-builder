"""Durable human_gate checkpoints: a paused run resumes on any instance and
after a restart. Each test pauses a run, then forgets every process-local
store (as a fresh Vercel instance would) before resuming."""

from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app import events, runtime, storage
from app.compiler import compile_graph
from app.main import app
from app.models import GraphDefinition, GraphEdge, GraphNode, NodePosition, NodeType
from app.releases import publish_release

client = TestClient(app)


def _gate_graph(graph_id: str) -> GraphDefinition:
    def node(node_id: str, node_type: NodeType, config: dict) -> GraphNode:
        return GraphNode(id=node_id, type=node_type, position=NodePosition(x=0, y=0), config=config)

    return GraphDefinition(
        id=graph_id,
        name="Gate",
        entry_node_id="input_1",
        nodes=[
            node("input_1", NodeType.INPUT, {"variableName": "question"}),
            node("gate_1", NodeType.HUMAN_GATE, {"content": "Approve?"}),
            node("output_1", NodeType.OUTPUT, {}),
        ],
        edges=[
            GraphEdge(id="e_input_gate", source="input_1", target="gate_1"),
            GraphEdge(id="e_gate_output", source="gate_1", target="output_1"),
        ],
    )


async def _paused_draft_run(graph_id: str, *, provider: str = "stub", api_key: str | None = None) -> str:
    graph = _gate_graph(graph_id)
    workflow_id = f"cwf_{uuid.uuid4().hex[:8]}"
    assert compile_graph(graph, workflow_id).ok
    runtime.COMPILED_WORKFLOWS[workflow_id] = graph
    run_id, _bus = await runtime.start_run_inline(workflow_id, {"question": "durable"}, provider=provider, api_key=api_key)
    assert runtime.get_run_summary(run_id).status == "paused"
    return run_id


def _forget_process_state(run_id: str) -> None:
    """What a fresh instance knows about the run: nothing but storage."""
    pause = runtime.RUN_PAUSES.pop(run_id, None)
    if pause is not None:
        runtime.COMPILED_WORKFLOWS.pop(pause.compiled_workflow_id, None)
    runtime.RUN_STORE.pop(run_id, None)
    runtime.RUN_TRACES.pop(run_id, None)
    runtime.RUN_BUSES.pop(run_id, None)
    events._BUSES.pop(run_id, None)


@pytest.fixture
def serverless(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(storage, "storage_is_healthy", lambda: True)


@pytest.mark.asyncio
async def test_a_paused_draft_run_resumes_on_a_fresh_instance(serverless: None) -> None:
    run_id = await _paused_draft_run("graph_durable_draft")
    stored = storage.get_run(run_id)
    assert stored is not None and stored.status == "paused" and stored.paused_node_id == "gate_1"
    assert [event.event_type for event in stored.events][-1] == "run.paused"

    _forget_process_state(run_id)
    response = client.post(f"/api/runs/{run_id}/resume", json={"approve": True})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "succeeded"
    assert response.json()["result"] == "durable"

    final = storage.get_run(run_id)
    types = [event.event_type for event in final.events]
    # The whole history survives the resume, in sequence order.
    assert types[0] == "run.snapshot_created" and "run.paused" in types and types[-1] == "run.completed"
    assert [event.sequence for event in final.events] == sorted(event.sequence for event in final.events)
    assert {trace.node_id for trace in storage.get_run_traces(run_id)} >= {"input_1", "gate_1", "output_1"}
    # Resolved: the checkpoint is gone, so a second resume finds nothing.
    assert storage.get_run_pause(run_id) is None
    assert client.post(f"/api/runs/{run_id}/resume", json={"approve": True}).status_code == 404


@pytest.mark.asyncio
async def test_a_paused_release_run_resumes_from_its_release(serverless: None) -> None:
    graph = _gate_graph("graph_durable_release")
    storage.save_graph(graph)
    release, _created = publish_release(graph)
    response = client.post(f"/api/graph-releases/{release.id}/runs", json={"input": {"question": "from release"}, "provider": "stub"})
    assert response.status_code == 200, response.text
    run_id = response.json()["run_id"]
    assert response.json()["status"] == "paused"

    _forget_process_state(run_id)
    resumed = client.post(f"/api/runs/{run_id}/resume", json={"approve": True})
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["status"] == "succeeded"
    assert resumed.json()["graph_release_id"] == release.id


@pytest.mark.asyncio
async def test_rejecting_on_a_fresh_instance_fails_the_run(serverless: None) -> None:
    run_id = await _paused_draft_run("graph_durable_reject")
    _forget_process_state(run_id)
    response = client.post(f"/api/runs/{run_id}/resume", json={"approve": False, "reason": "Not now"})
    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    final = storage.get_run(run_id)
    assert final.error == "Not now"
    assert [event.event_type for event in final.events][-2:] == ["run.paused", "run.failed"]
    assert storage.get_run_pause(run_id) is None


@pytest.mark.asyncio
async def test_the_api_key_is_never_stored_and_must_be_resent(serverless: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    run_id = await _paused_draft_run("graph_durable_key", provider="groq", api_key="sk-secret-value")
    stored = storage.get_run_pause(run_id)
    assert stored is not None and "api_key" not in stored
    assert "sk-secret-value" not in json.dumps(stored)

    # The same instance still has the key in memory.
    assert runtime.get_run_pause_state(run_id).api_key == "sk-secret-value"

    _forget_process_state(run_id)
    missing = client.post(f"/api/runs/{run_id}/resume", json={"approve": True})
    assert missing.status_code == 409
    assert "needs an API key" in missing.json()["detail"]
    # Still paused: the request can be retried with the key.
    assert storage.get_run_pause(run_id) is not None

    with_key = client.post(f"/api/runs/{run_id}/resume", json={"approve": True, "api_key": "sk-secret-value"})
    assert with_key.status_code == 200, with_key.text
    assert with_key.json()["status"] == "succeeded"


@pytest.mark.asyncio
async def test_event_replay_without_a_live_bus_comes_from_storage(serverless: None) -> None:
    run_id = await _paused_draft_run("graph_durable_events")
    _forget_process_state(run_id)
    response = client.get(f"/api/runs/{run_id}/events")
    assert response.status_code == 200
    assert "run.paused" in response.text
