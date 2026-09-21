"""Routing policy lab.

Part of the P1 rollout plan (docs/planning/features/p1-rollout-plan.md),
Slice D: "Routing policy lab". Runs a graph against a fixture dataset —
reusing Slice B's `simulate_graph` once per fixture, with the exact same
guarantees a single simulate call has: LLM calls are always forced to the
stub provider (never live), and a node's live executor is skipped only
when that fixture stubs it — and aggregates the resulting `route_decisions`
into a per-router/branch-node distribution: how many dataset runs selected
each outgoing target. Comparing two such reports is
`graph-native-control-plane-plan.md` Section 4's "compare routing versions
over fixture datasets."

`compute_router`/`compute_branch` (nodes.py) select an edge by matching its
`condition` against the upstream classification text — there is no
separate "threshold" config field today. A "router threshold changed"
comparison in practice means two graph variants whose router/branch edge
`condition`s differ; this module is graph-agnostic about that and just
runs whatever graph it's given against the same dataset twice.

Depends on Slice B's `simulate.py` existing first, per the P1 doc's
sequencing.
"""

from __future__ import annotations

from datetime import datetime

from .analytics import estimate_run_tokens
from .models import (
    Fixture,
    GraphDefinition,
    RouteNodeDistribution,
    RouteNodeDistributionDelta,
    RouteTargetCount,
    RouteTargetCountDelta,
    RoutingComparison,
    RoutingDatasetRunResult,
    RoutingLabReport,
)
from .simulate import SimulateBlocked, simulate_graph


class RoutingLabBlocked(SimulateBlocked):
    """A dataset fixture was blocked by `simulate_graph` (unknown/
    unstubbable node target, or the graph itself fails to compile).
    Fails the whole dataset run rather than reporting a partial result,
    since a malformed fixture usually means every other fixture in the
    same dataset would hit the same graph-level problem."""


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _duration_ms(started_at: str | None, completed_at: str | None) -> int | None:
    started = _parse_iso(started_at)
    completed = _parse_iso(completed_at)
    if started is None or completed is None:
        return None
    return max(0, round((completed - started).total_seconds() * 1000))


def _aggregate_distributions(runs: list[RoutingDatasetRunResult]) -> list[RouteNodeDistribution]:
    # node_id -> target_node_id -> count, insertion-ordered so a report's
    # shape is deterministic for a given dataset run order.
    counts: dict[str, dict[str, int]] = {}
    for run in runs:
        for decision in run.route_decisions:
            node_counts = counts.setdefault(decision.node_id, {})
            node_counts[decision.selected_target_node_id] = (
                node_counts.get(decision.selected_target_node_id, 0) + 1
            )
    return [
        RouteNodeDistribution(
            node_id=node_id,
            total=sum(target_counts.values()),
            targets=[
                RouteTargetCount(target_node_id=target_id, count=count)
                for target_id, count in target_counts.items()
            ],
        )
        for node_id, target_counts in counts.items()
    ]


async def run_routing_dataset(graph: GraphDefinition, dataset: list[Fixture]) -> RoutingLabReport:
    """Runs `graph` once per fixture in `dataset`, collecting each run's
    route decisions, estimated cost, and duration, then aggregates a
    per-router/branch-node route distribution across the whole dataset."""
    runs: list[RoutingDatasetRunResult] = []
    for index, fixture in enumerate(dataset):
        try:
            result = await simulate_graph(graph, fixture)
        except SimulateBlocked as exc:
            raise RoutingLabBlocked(exc.diagnostics) from exc
        token_estimate = estimate_run_tokens(result.run)
        runs.append(
            RoutingDatasetRunResult(
                fixture_index=index,
                run_id=result.run.run_id,
                status=result.run.status,
                route_decisions=result.run.route_decisions,
                estimated_usd=token_estimate.estimated_usd,
                duration_ms=_duration_ms(result.run.started_at, result.run.completed_at),
            )
        )

    return RoutingLabReport(
        graph_id=graph.id,
        dataset_size=len(dataset),
        distributions=_aggregate_distributions(runs),
        total_estimated_usd=sum(r.estimated_usd for r in runs),
        runs=runs,
    )


def compare_routing_reports(
    baseline: RoutingLabReport, candidate: RoutingLabReport
) -> RoutingComparison:
    """Categorized per-target delta between two reports' route
    distributions — the "routing version comparison" this slice's exit gate
    asks for. A node/target present in only one report shows a zero count
    on the other side, matching how `ReleaseDiff` treats an added/removed
    element as a delta from/to nothing."""
    by_node: dict[str, dict[str, list[int]]] = {}
    for report, slot in ((baseline, 0), (candidate, 1)):
        for distribution in report.distributions:
            node_targets = by_node.setdefault(distribution.node_id, {})
            for target in distribution.targets:
                counts = node_targets.setdefault(target.target_node_id, [0, 0])
                counts[slot] = target.count

    distribution_deltas = [
        RouteNodeDistributionDelta(
            node_id=node_id,
            targets=[
                RouteTargetCountDelta(
                    target_node_id=target_id, baseline_count=counts[0], candidate_count=counts[1]
                )
                for target_id, counts in target_counts.items()
            ],
        )
        for node_id, target_counts in by_node.items()
    ]
    return RoutingComparison(
        baseline=baseline, candidate=candidate, distribution_deltas=distribution_deltas
    )


__all__ = ["RoutingLabBlocked", "run_routing_dataset", "compare_routing_reports"]
