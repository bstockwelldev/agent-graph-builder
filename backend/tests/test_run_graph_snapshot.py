"""P0 graph foundation, Slice D: RunGraphSnapshot persistence, run identity
fields, and the exit gate — a historical run still opens with an agreeing
graph snapshot after the draft changes or the graph is deleted."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import runtime, storage
from app.demo_graph import build_demo_graph
from app.fingerprint import semantic_fingerprint
from app.main import app
from app.releases import publish_release

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


@pytest.mark.asyncio
async def test_draft_sourced_run_persists_a_full_snapshot() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    compile_result = runtime.compile_workflow(graph)
    assert compile_result.ok, compile_result.diagnostics

    run_id, bus = runtime.start_run(
        compile_result.compiled_workflow_id, {"question": "hi"}, provider="stub"
    )
    async for _ in bus.stream():
        pass

    summary = runtime.RUN_STORE[run_id]
    assert summary.status == "succeeded"
    assert summary.source == "draft_snapshot"
    assert summary.graph_release_id is None
    assert summary.graph_fingerprint == semantic_fingerprint(graph)
    assert summary.runtime_target == "langgraph"
    assert summary.compiler_version

    payload = storage.get_run_graph_snapshot(run_id)
    assert payload is not None
    assert payload["source"] == "draft_snapshot"
    assert payload["release_id"] is None
    assert payload["graph"]["id"] == graph.id
    assert payload["resource_snapshots"] == {}
    assert payload["graph_fingerprint"] == semantic_fingerprint(graph)


@pytest.mark.asyncio
async def test_release_sourced_run_persists_a_thin_pointer_only() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    release, _created = publish_release(graph)

    compile_result = runtime.compile_workflow(release.graph)
    assert compile_result.ok

    run_id, bus = runtime.start_run(
        compile_result.compiled_workflow_id,
        {"question": "hi"},
        provider="stub",
        release_resource_snapshots=release.resource_snapshots,
        release_id=release.id,
    )
    async for _ in bus.stream():
        pass

    summary = runtime.RUN_STORE[run_id]
    assert summary.source == "release"
    assert summary.graph_release_id == release.id
    assert summary.graph_fingerprint == semantic_fingerprint(graph)

    payload = storage.get_run_graph_snapshot(run_id)
    assert payload is not None
    assert payload["source"] == "release"
    assert payload["release_id"] == release.id
    # Thin pointer only — no content duplication of what the release
    # already durably stores.
    assert payload["graph"] is None
    assert payload["resource_snapshots"] is None


@pytest.mark.asyncio
async def test_run_snapshot_created_event_is_emitted() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    compile_result = runtime.compile_workflow(graph)

    run_id, bus = runtime.start_run(
        compile_result.compiled_workflow_id, {"question": "hi"}, provider="stub"
    )
    async for _ in bus.stream():
        pass

    events = runtime.RUN_STORE[run_id].events
    assert any(e.event_type == "run.snapshot_created" for e in events)


@pytest.mark.asyncio
async def test_get_run_graph_snapshot_endpoint_round_trip_and_404() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    compile_result = runtime.compile_workflow(graph)
    run_id, _bus = await runtime.start_run_inline(
        compile_result.compiled_workflow_id, {"question": "hi"}, provider="stub"
    )

    response = client.get(f"/api/runs/{run_id}/snapshot")
    assert response.status_code == 200
    assert response.json()["run_id"] == run_id

    assert client.get("/api/runs/run_missing/snapshot").status_code == 404


@pytest.mark.asyncio
async def test_historical_run_snapshot_survives_a_later_draft_edit() -> None:
    """Exit gate: after a draft changes, a historical run still opens with
    an agreeing graph snapshot."""
    graph = build_demo_graph()
    storage.save_graph(graph)
    compile_result = runtime.compile_workflow(graph)
    run_id, bus = runtime.start_run(
        compile_result.compiled_workflow_id, {"question": "hi"}, provider="stub"
    )
    async for _ in bus.stream():
        pass

    original_snapshot = storage.get_run_graph_snapshot(run_id)
    assert original_snapshot["graph"]["name"] == graph.name

    storage.save_graph(graph.model_copy(update={"name": "Renamed after the run"}))

    reread_snapshot = storage.get_run_graph_snapshot(run_id)
    assert reread_snapshot["graph"]["name"] == graph.name
    assert reread_snapshot["graph"]["name"] != "Renamed after the run"


@pytest.mark.asyncio
async def test_deleting_the_graph_never_removes_run_or_snapshot_records() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    release, _created = publish_release(graph)
    compile_result = runtime.compile_workflow(graph)
    run_id, bus = runtime.start_run(
        compile_result.compiled_workflow_id, {"question": "hi"}, provider="stub"
    )
    async for _ in bus.stream():
        pass

    assert storage.delete_graph(graph.id) is True

    assert storage.get_run(run_id) is not None
    assert storage.get_run_traces(run_id) != []
    assert storage.get_run_graph_snapshot(run_id) is not None
    assert storage.get_release_index(graph.id) != []
    assert storage.get_release(release.id, graph.id) is not None
    assert storage.get_graph(graph.id) is None
