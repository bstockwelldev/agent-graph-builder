"""Graph- and node-scoped run analytics (studio-graph-workbench-redesign-plan.md,
Wave 2 / Linear STO-603; review sections 36-38: "Analytics must be
embedded", "Node analytics", "Analytics as context").

`analytics.py` only aggregates workspace-wide totals, a daily series, and a
per-graph breakdown -- nothing a user looking at one graph or one node can
act on. This module rolls a single graph's recent runs up per node (runs,
success rate, average/P95 latency, last error) and lists one node's recent
executions, so the Studio can show metrics in graph and node context and
link each one back to a run.

Latency comes from each NodeTrace's own started_at/completed_at, so it's
the node's own execution time, not the whole run's. Built from
`storage.list_runs_with_traces` -- one read per run -- over a bounded
window of recent runs.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping

from pydantic import BaseModel

from . import storage
from .analytics import AnalyticsTotals, _parse_iso, build_analytics_dashboard
from .models import NodeTrace, RunSummary

DEFAULT_RUN_WINDOW = 50
DEFAULT_HISTORY_LIMIT = 20


class NodeMetrics(BaseModel):
    node_id: str
    node_type: str
    executions: int
    succeeded: int
    failed: int
    # None when the node never reached a terminal status in the window.
    success_rate: float | None
    avg_duration_ms: int | None
    p95_duration_ms: int | None
    last_run_id: str | None
    last_run_at: str | None
    last_error: str | None


class GraphAnalytics(BaseModel):
    graph_id: str
    run_window: int
    totals: AnalyticsTotals
    succeeded_runs: int
    failed_runs: int
    success_rate: float | None
    p95_duration_ms: int | None
    nodes: list[NodeMetrics]


class NodeExecution(BaseModel):
    run_id: str
    run_status: str
    status: str
    started_at: str | None
    duration_ms: int | None
    error: str | None


def trace_duration_ms(trace: NodeTrace) -> int | None:
    started = _parse_iso(trace.started_at)
    completed = _parse_iso(trace.completed_at)
    if started is None or completed is None:
        return None
    return max(0, round((completed - started).total_seconds() * 1000))


def _run_duration_ms(run: RunSummary) -> int | None:
    started = _parse_iso(run.started_at)
    completed = _parse_iso(run.completed_at)
    if started is None or completed is None:
        return None
    return max(0, round((completed - started).total_seconds() * 1000))


def percentile(values: Iterable[int], pct: float) -> int | None:
    """Nearest-rank percentile (no interpolation) -- stable for the small
    samples a 50-run window produces."""
    ordered = sorted(values)
    if not ordered:
        return None
    rank = max(1, math.ceil(pct / 100 * len(ordered)))
    return ordered[rank - 1]


def _rate(succeeded: int, failed: int) -> float | None:
    terminal = succeeded + failed
    return succeeded / terminal if terminal else None


def build_graph_analytics(
    graph_id: str,
    runs: list[RunSummary],
    traces_by_run: Mapping[str, list[NodeTrace]],
) -> GraphAnalytics:
    """Pure aggregation over already-loaded runs/traces. `runs` is
    expected newest-first (storage.list_runs_for_graph's order), which is
    what makes the first trace seen per node its "last" one."""
    per_node: dict[str, dict] = {}
    for run in runs:
        for trace in traces_by_run.get(run.run_id, []):
            bucket = per_node.setdefault(
                trace.node_id,
                {
                    "node_type": trace.node_type.value,
                    "executions": 0,
                    "succeeded": 0,
                    "failed": 0,
                    "durations": [],
                    "last_run_id": run.run_id,
                    "last_run_at": trace.started_at or run.started_at,
                    "last_error": None,
                },
            )
            bucket["executions"] += 1
            if trace.status == "succeeded":
                bucket["succeeded"] += 1
            elif trace.status == "failed":
                bucket["failed"] += 1
                if bucket["last_error"] is None:
                    bucket["last_error"] = trace.error
            duration = trace_duration_ms(trace)
            if duration is not None:
                bucket["durations"].append(duration)

    nodes = [
        NodeMetrics(
            node_id=node_id,
            node_type=v["node_type"],
            executions=v["executions"],
            succeeded=v["succeeded"],
            failed=v["failed"],
            success_rate=_rate(v["succeeded"], v["failed"]),
            avg_duration_ms=round(sum(v["durations"]) / len(v["durations"]))
            if v["durations"]
            else None,
            p95_duration_ms=percentile(v["durations"], 95),
            last_run_id=v["last_run_id"],
            last_run_at=v["last_run_at"],
            last_error=v["last_error"],
        )
        for node_id, v in per_node.items()
    ]
    # Slowest first: "slow nodes are easy to identify" (review section 82).
    nodes.sort(key=lambda n: (n.p95_duration_ms is None, -(n.p95_duration_ms or 0), n.node_id))

    succeeded_runs = sum(1 for run in runs if run.status == "succeeded")
    failed_runs = sum(1 for run in runs if run.status == "failed")
    run_durations = [d for d in (_run_duration_ms(run) for run in runs) if d is not None]
    totals = build_analytics_dashboard(
        runs, {graph_id: graph_id}, traces_by_run=traces_by_run
    ).totals

    return GraphAnalytics(
        graph_id=graph_id,
        run_window=len(runs),
        totals=totals,
        succeeded_runs=succeeded_runs,
        failed_runs=failed_runs,
        success_rate=_rate(succeeded_runs, failed_runs),
        p95_duration_ms=percentile(run_durations, 95),
        nodes=nodes,
    )


def build_node_history(
    node_id: str,
    runs: list[RunSummary],
    traces_by_run: Mapping[str, list[NodeTrace]],
    *,
    limit: int = DEFAULT_HISTORY_LIMIT,
) -> list[NodeExecution]:
    history: list[NodeExecution] = []
    for run in runs:
        trace = next((t for t in traces_by_run.get(run.run_id, []) if t.node_id == node_id), None)
        if trace is None:
            continue
        history.append(
            NodeExecution(
                run_id=run.run_id,
                run_status=run.status,
                status=trace.status,
                started_at=trace.started_at or run.started_at,
                duration_ms=trace_duration_ms(trace),
                error=trace.error,
            )
        )
        if len(history) >= limit:
            break
    return history


def _load(graph_id: str, run_window: int) -> tuple[list[RunSummary], dict[str, list[NodeTrace]]]:
    pairs = storage.list_runs_with_traces(graph_id=graph_id, limit=run_window)
    return [run for run, _ in pairs], {run.run_id: traces for run, traces in pairs}


def get_graph_analytics(graph_id: str, *, run_window: int = DEFAULT_RUN_WINDOW) -> GraphAnalytics:
    runs, traces = _load(graph_id, run_window)
    return build_graph_analytics(graph_id, runs, traces)


def get_node_history(
    graph_id: str,
    node_id: str,
    *,
    limit: int = DEFAULT_HISTORY_LIMIT,
    run_window: int = DEFAULT_RUN_WINDOW,
) -> list[NodeExecution]:
    runs, traces = _load(graph_id, run_window)
    return build_node_history(node_id, runs, traces, limit=limit)
