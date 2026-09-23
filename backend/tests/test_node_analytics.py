"""Graph- and node-scoped analytics (studio-graph-workbench-redesign-plan.md,
Wave 2 / STO-603). Pure aggregation tests over hand-built runs/traces, plus
an end-to-end demo-graph run through the two new routes."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import storage
from app.compiler import compile_graph
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import NodeTrace, NodeType, RunSummary
from app.node_analytics import build_graph_analytics, build_node_history, percentile
from app.runtime import COMPILED_WORKFLOWS, start_run_inline

client = TestClient(app)


def _run(run_id: str, status: str, started: str = "2026-09-23T10:00:00+00:00") -> RunSummary:
    return RunSummary(
        run_id=run_id,
        graph_id="g",
        status=status,
        started_at=started,
        completed_at="2026-09-23T10:00:05+00:00",
    )


def _trace(node_id: str, status: str, ms: int, error: str | None = None) -> NodeTrace:
    return NodeTrace(
        node_id=node_id,
        node_type=NodeType.LLM,
        status=status,
        started_at="2026-09-23T10:00:00+00:00",
        completed_at=f"2026-09-23T10:00:0{ms // 1000}.{ms % 1000:03d}+00:00",
        error=error,
    )


def test_percentile_is_nearest_rank() -> None:
    assert percentile([], 95) is None
    assert percentile([100], 95) == 100
    assert percentile(list(range(1, 101)), 95) == 95
    assert percentile([10, 20, 30, 40], 50) == 20


def test_graph_analytics_rolls_up_per_node() -> None:
    runs = [_run("r3", "failed"), _run("r2", "succeeded"), _run("r1", "succeeded")]
    traces = {
        "r3": [_trace("llm", "failed", 900, error="boom"), _trace("fast", "succeeded", 10)],
        "r2": [_trace("llm", "succeeded", 300), _trace("fast", "succeeded", 20)],
        "r1": [_trace("llm", "succeeded", 600)],
    }
    result = build_graph_analytics("g", runs, traces)

    assert result.run_window == 3
    assert result.succeeded_runs == 2 and result.failed_runs == 1
    assert result.success_rate == 2 / 3

    llm = next(n for n in result.nodes if n.node_id == "llm")
    assert (llm.executions, llm.succeeded, llm.failed) == (3, 2, 1)
    assert llm.success_rate == 2 / 3
    assert llm.avg_duration_ms == 600
    assert llm.p95_duration_ms == 900
    # Newest-first input: the first trace seen is the latest one.
    assert llm.last_run_id == "r3"
    assert llm.last_error == "boom"

    # Slowest node first, so slow nodes are easy to spot.
    assert [n.node_id for n in result.nodes] == ["llm", "fast"]


def test_graph_analytics_empty_window() -> None:
    result = build_graph_analytics("g", [], {})
    assert result.nodes == []
    assert result.success_rate is None
    assert result.p95_duration_ms is None


def test_node_history_lists_only_that_nodes_executions_newest_first() -> None:
    runs = [_run("r3", "failed"), _run("r2", "succeeded"), _run("r1", "succeeded")]
    traces = {
        "r3": [_trace("llm", "failed", 900, error="boom")],
        "r2": [_trace("other", "succeeded", 5)],
        "r1": [_trace("llm", "succeeded", 600)],
    }
    history = build_node_history("llm", runs, traces)
    assert [h.run_id for h in history] == ["r3", "r1"]
    assert history[0].status == "failed" and history[0].error == "boom"
    assert history[0].duration_ms == 900
    assert build_node_history("llm", runs, traces, limit=1)[0].run_id == "r3"


async def test_routes_reflect_a_real_demo_run() -> None:
    demo = build_demo_graph().model_copy(update={"id": "node_analytics_e2e_graph"})
    storage.save_graph(demo)
    compiled = compile_graph(demo, "cwf_node_analytics_e2e")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_node_analytics_e2e"] = demo
    run_id, _bus = await start_run_inline(
        "cwf_node_analytics_e2e", {"question": "What is a database index?"}, provider="stub"
    )

    response = client.get(f"/api/graphs/{demo.id}/analytics")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["run_window"] >= 1
    node_ids = {n["node_id"] for n in body["nodes"]}
    assert demo.entry_node_id in node_ids

    history = client.get(f"/api/graphs/{demo.id}/nodes/{demo.entry_node_id}/history")
    assert history.status_code == 200, history.text
    assert history.json()[0]["run_id"] == run_id


def test_routes_404_for_unknown_graph() -> None:
    assert client.get("/api/graphs/does_not_exist/analytics").status_code == 404
    assert client.get("/api/graphs/does_not_exist/nodes/x/history").status_code == 404
