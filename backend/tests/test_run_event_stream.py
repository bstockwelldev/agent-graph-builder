"""SDK 2/7 (STO-615): a broadcast run-event log and a resumable SSE stream."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import events, runtime, storage
from app.demo_graph import build_demo_graph
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _ids(text: str) -> list[int]:
    return [int(line[4:]) for line in text.splitlines() if line.startswith("id: ")]


async def _collect(stream) -> list[int]:
    return [event.sequence async for event in stream]


@pytest.mark.asyncio
async def test_every_subscriber_sees_every_event_and_after_skips() -> None:
    bus = events.RunEventBus("run_x")
    for i in range(3):
        bus.emit("node.started", {"i": i})
    first = bus.stream()
    second = bus.stream(after=2)
    bus.emit("run.completed", {})
    bus.close()
    assert await _collect(first) == [1, 2, 3, 4]
    assert await _collect(second) == [3, 4]


def test_resumed_bus_keeps_sequences_climbing() -> None:
    first = events.create_bus("run_resume")
    first.emit("run.started", {})
    first.emit("run.paused", {})
    second = events.create_bus("run_resume")
    assert second.emit("run.resumed", {}).sequence == 3


@pytest.mark.asyncio
async def test_sse_frames_have_ids_and_resume_after_last_event_id() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    compiled = runtime.compile_workflow(graph)
    run_id, _ = await runtime.start_run_inline(
        compiled.compiled_workflow_id, {"question": "how does an index work"}, provider="stub"
    )

    full = client.get(f"/api/runs/{run_id}/events")
    ids = _ids(full.text)
    assert ids == sorted(ids) and len(ids) >= 5 and ids[0] == 1
    assert full.text.startswith("retry: 1000")
    first_data = next(line for line in full.text.splitlines() if line.startswith("data: "))
    assert json.loads(first_data[6:])["sequence"] == 1

    resumed = client.get(f"/api/runs/{run_id}/events", headers={"Last-Event-ID": "3"})
    assert _ids(resumed.text) == [i for i in ids if i > 3]
    assert _ids(client.get(f"/api/runs/{run_id}/events?after=4").text) == [i for i in ids if i > 4]


@pytest.mark.asyncio
async def test_without_a_live_bus_persisted_events_replay() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    compiled = runtime.compile_workflow(graph)
    run_id, _ = await runtime.start_run_inline(
        compiled.compiled_workflow_id, {"question": "q"}, provider="stub"
    )
    events._BUSES.pop(run_id)  # another isolate: no live bus here
    response = client.get(f"/api/runs/{run_id}/events", headers={"Last-Event-ID": "2"})
    ids = _ids(response.text)
    assert ids and ids[0] == 3
    assert "no live bus" not in response.text
