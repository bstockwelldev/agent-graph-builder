"""Tests for durable run snapshots in SQLite."""

from __future__ import annotations

import pytest

from app import runtime, storage
from app.demo_graph import build_demo_graph
from app.models import RunSummary

from tests.helpers import run_graph_and_wait


@pytest.fixture
def demo_graph():
    graph = build_demo_graph()
    storage.save_graph(graph)
    return graph


@pytest.mark.asyncio
async def test_completed_run_persists_summary_and_traces(demo_graph, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "runs.db")

    compile_result = runtime.compile_workflow(demo_graph)
    run_id = await run_graph_and_wait(
        compile_result.compiled_workflow_id,
        "How does a database index work?",
    )

    runtime.RUN_STORE.pop(run_id, None)
    runtime.RUN_TRACES.pop(run_id, None)

    stored = storage.get_run(run_id)
    assert stored is not None
    assert stored.status == "succeeded"
    assert stored.input.get("question") == "How does a database index work?"
    assert stored.provider == "stub"
    assert stored.completed_at is not None

    traces = storage.get_run_traces(run_id)
    executed = {trace.node_id for trace in traces}
    assert "tool_lookup" in executed
    assert "llm_answer" not in executed


@pytest.mark.asyncio
async def test_list_runs_for_graph_returns_newest_first(demo_graph, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "runs.db")

    compile_result = runtime.compile_workflow(demo_graph)
    first = await run_graph_and_wait(compile_result.compiled_workflow_id, "Question one")
    second = await run_graph_and_wait(compile_result.compiled_workflow_id, "Question two")

    runs = storage.list_runs_for_graph(demo_graph.id)
    assert len(runs) >= 2
    assert runs[0].run_id == second
    assert runs[1].run_id == first


def test_get_run_summary_falls_back_to_storage(demo_graph, tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "runs.db")

    summary = RunSummary(
        run_id="run_test123",
        graph_id=demo_graph.id,
        status="succeeded",
        input={"question": "stored"},
        provider="stub",
        result="done",
        started_at="2026-01-01T00:00:00+00:00",
        completed_at="2026-01-01T00:00:01+00:00",
    )
    storage.save_run_snapshot(summary, [])

    loaded = runtime.get_run_summary("run_test123")
    assert loaded is not None
    assert loaded.result == "done"
