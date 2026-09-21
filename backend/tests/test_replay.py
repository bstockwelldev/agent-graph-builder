"""P1 rollout plan, Slice C: historical replay. Exit gate — replaying a
completed run reproduces its recorded node outputs exactly, with zero live
provider/tool calls made, for both draft-sourced and release-sourced runs."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import nodes, runtime, storage
from app.demo_graph import build_demo_graph
from app.main import app
from app.releases import publish_release
from app.replay import ReplayBlocked, ReplayNotFound, replay_run

client = TestClient(app)

_QUESTION = "how does a database index work"


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


async def _run_demo_graph(graph, *, release_id=None, release_resource_snapshots=None) -> str:
    compile_result = runtime.compile_workflow(graph)
    assert compile_result.ok, compile_result.diagnostics
    run_id, _bus = await runtime.start_run_inline(
        compile_result.compiled_workflow_id,
        {"question": _QUESTION},
        provider="stub",
        release_resource_snapshots=release_resource_snapshots,
        release_id=release_id,
    )
    return run_id


@pytest.mark.asyncio
async def test_replay_reproduces_a_draft_sourced_run_s_node_outputs() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    run_id = await _run_demo_graph(graph)
    original_traces = {t.node_id: t.output for t in runtime.get_run_node_traces(run_id)}

    result = await replay_run(run_id)

    assert result.run.status == "succeeded"
    replayed_traces = {t.node_id: t.output for t in result.traces}
    assert replayed_traces == original_traces


@pytest.mark.asyncio
async def test_replay_never_calls_the_live_tool_executor(monkeypatch) -> None:
    calls: list[str] = []

    graph = build_demo_graph()
    storage.save_graph(graph)
    run_id = await _run_demo_graph(graph)

    def spy_lookup_topic(topic: str) -> str:
        calls.append(topic)
        return "SHOULD NOT BE CALLED"

    monkeypatch.setattr(nodes, "lookup_topic", spy_lookup_topic)

    result = await replay_run(run_id)
    assert result.run.status == "succeeded"
    assert calls == []


@pytest.mark.asyncio
async def test_replay_reproduces_a_release_sourced_run() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    release, _created = publish_release(graph)
    run_id = await _run_demo_graph(
        release.graph, release_id=release.id, release_resource_snapshots=release.resource_snapshots
    )
    original_summary = runtime.RUN_STORE[run_id]
    assert original_summary.source == "release"

    result = await replay_run(run_id)
    assert result.run.status == "succeeded"
    assert result.run.source == "release"
    assert result.run.graph_release_id == release.id


@pytest.mark.asyncio
async def test_replay_survives_a_later_draft_edit() -> None:
    """Exit gate parity with Slice D's RunGraphSnapshot guarantee: a replay
    must still reproduce the run exactly after the draft graph changes."""
    graph = build_demo_graph()
    storage.save_graph(graph)
    run_id = await _run_demo_graph(graph)
    original_traces = {t.node_id: t.output for t in runtime.get_run_node_traces(run_id)}

    storage.save_graph(graph.model_copy(update={"name": "Renamed after the run"}))

    result = await replay_run(run_id)
    replayed_traces = {t.node_id: t.output for t in result.traces}
    assert replayed_traces == original_traces


@pytest.mark.asyncio
async def test_replay_is_blocked_for_an_unsuccessful_run() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    compile_result = runtime.compile_workflow(graph)
    run_id, _bus = await runtime.start_run_inline(
        compile_result.compiled_workflow_id, {"question": _QUESTION}, provider="stub"
    )
    runtime.RUN_STORE[run_id].status = "failed"

    with pytest.raises(ReplayBlocked) as exc_info:
        await replay_run(run_id)
    assert any(d.code == "REPLAY_RUN_NOT_SUCCEEDED" for d in exc_info.value.diagnostics)


@pytest.mark.asyncio
async def test_replay_raises_not_found_for_an_unknown_run() -> None:
    with pytest.raises(ReplayNotFound):
        await replay_run("run_does_not_exist")


@pytest.mark.asyncio
async def test_replay_endpoint_round_trip() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    # Guarantee the run has actually finished before hitting the endpoint —
    # POST /api/runs schedules a background asyncio task and returns
    # immediately, so the run's status right after that call is racy.
    run_id = await _run_demo_graph(graph)

    replay_response = client.post(f"/api/runs/{run_id}/replay")
    assert replay_response.status_code == 200, replay_response.text
    assert replay_response.json()["run"]["status"] == "succeeded"


def test_replay_endpoint_404_for_unknown_run() -> None:
    response = client.post("/api/runs/run_missing/replay")
    assert response.status_code == 404
