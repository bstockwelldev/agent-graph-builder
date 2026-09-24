"""Graph health score (large-graph complexity, Wave 7a / STO-610).

One 0-100 number for "how much attention does this graph need", with a
breakdown that says why. It starts at 100 and each factor subtracts up to a
cap, so no single problem class can dominate the score:

- blocking errors, warnings (structure, contract and policy diagnostics);
- unreachable nodes and dead ends (graph shape);
- untested nodes and recent run failure rate (run history);
- complexity (depth / fan-out).

Every factor lists the nodes/edges behind it, so Studio can link each item
to the canvas. Pure: callers pass the diagnostics and analytics in.
"""

from __future__ import annotations

from collections import deque
from typing import Literal

from pydantic import BaseModel, Field

from .events import now_iso
from .models import Diagnostic, GraphDefinition, NodeType
from .node_analytics import GraphAnalytics

HealthBand = Literal["healthy", "attention", "at_risk"]

_MAX_DEPTH = 12
_MAX_FAN_OUT = 5
_COUNTED_ELSEWHERE = frozenset({"GRAPH_UNREACHABLE_NODE"})


class HealthItem(BaseModel):
    node_id: str | None = None
    edge_id: str | None = None
    message: str


class HealthFactor(BaseModel):
    id: str
    label: str
    deduction: int
    max: int
    items: list[HealthItem] = Field(default_factory=list)
    note: str | None = None


class GraphHealth(BaseModel):
    graph_id: str
    score: int
    band: HealthBand
    factors: list[HealthFactor]
    computed_at: str


def _band(score: int) -> HealthBand:
    if score >= 85:
        return "healthy"
    if score >= 60:
        return "attention"
    return "at_risk"


def _reachable(graph: GraphDefinition) -> set[str]:
    adjacency: dict[str, list[str]] = {}
    for edge in graph.edges:
        adjacency.setdefault(edge.source, []).append(edge.target)
    if graph.entry_node_id not in {n.id for n in graph.nodes}:
        return set()
    seen = {graph.entry_node_id}
    queue = deque([graph.entry_node_id])
    while queue:
        for target in adjacency.get(queue.popleft(), []):
            if target not in seen:
                seen.add(target)
                queue.append(target)
    return seen


def _longest_path(graph: GraphDefinition) -> int:
    """Longest edge count from the entry node (cycles are cut, not followed)."""
    adjacency: dict[str, list[str]] = {}
    for edge in graph.edges:
        adjacency.setdefault(edge.source, []).append(edge.target)
    memo: dict[str, int] = {}

    def depth(node_id: str, stack: frozenset[str]) -> int:
        if node_id in memo:
            return memo[node_id]
        best = 0
        for target in adjacency.get(node_id, []):
            if target not in stack:
                best = max(best, 1 + depth(target, stack | {target}))
        memo[node_id] = best
        return best

    return depth(graph.entry_node_id, frozenset({graph.entry_node_id}))


def _diagnostic_item(diagnostic: Diagnostic) -> HealthItem:
    return HealthItem(
        node_id=diagnostic.node_id, edge_id=diagnostic.edge_id, message=diagnostic.message
    )


def compute_graph_health(
    graph: GraphDefinition, diagnostics: list[Diagnostic], analytics: GraphAnalytics | None
) -> GraphHealth:
    factors: list[HealthFactor] = []

    blocking = [d for d in diagnostics if d.blocking]
    factors.append(
        HealthFactor(
            id="blocking_errors",
            label="Blocking errors",
            deduction=min(50, 25 * len(blocking)),
            max=50,
            items=[_diagnostic_item(d) for d in blocking],
        )
    )
    # Unreachable nodes have their own factor below; don't charge them twice.
    warnings = [d for d in diagnostics if not d.blocking and d.code not in _COUNTED_ELSEWHERE]
    factors.append(
        HealthFactor(
            id="warnings",
            label="Warnings",
            deduction=min(15, 3 * len(warnings)),
            max=15,
            items=[_diagnostic_item(d) for d in warnings],
        )
    )

    reachable = _reachable(graph)
    unreachable = [n for n in graph.nodes if n.id not in reachable]
    factors.append(
        HealthFactor(
            id="unreachable",
            label="Unreachable nodes",
            deduction=min(15, 5 * len(unreachable)),
            max=15,
            items=[
                HealthItem(node_id=n.id, message=f"{n.id} can't be reached from the entry node.")
                for n in unreachable
            ],
        )
    )

    sources = {e.source for e in graph.edges}
    dead_ends = [n for n in graph.nodes if n.type != NodeType.OUTPUT and n.id not in sources]
    factors.append(
        HealthFactor(
            id="dead_ends",
            label="Dead ends",
            deduction=min(10, 5 * len(dead_ends)),
            max=10,
            items=[
                HealthItem(
                    node_id=n.id, message=f"{n.id} has no outgoing edge and isn't an output."
                )
                for n in dead_ends
            ],
        )
    )

    total_runs = (analytics.succeeded_runs + analytics.failed_runs) if analytics else 0
    if analytics is None or analytics.run_window == 0:
        factors.append(
            HealthFactor(
                id="untested", label="Untested nodes", deduction=0, max=15, note="No runs yet."
            )
        )
        factors.append(
            HealthFactor(
                id="failures", label="Recent run failures", deduction=0, max=20, note="No runs yet."
            )
        )
    else:
        executed = {m.node_id for m in analytics.nodes if m.executions > 0}
        untested = [n for n in graph.nodes if n.id not in executed]
        fraction = len(untested) / len(graph.nodes) if graph.nodes else 0.0
        factors.append(
            HealthFactor(
                id="untested",
                label="Untested nodes",
                deduction=round(15 * fraction),
                max=15,
                items=[
                    HealthItem(
                        node_id=n.id,
                        message=f"{n.id} hasn't run in the last {analytics.run_window} runs.",
                    )
                    for n in untested
                ],
            )
        )
        failure_rate = analytics.failed_runs / total_runs if total_runs else 0.0
        failed_nodes = [m for m in analytics.nodes if m.failed > 0]
        factors.append(
            HealthFactor(
                id="failures",
                label="Recent run failures",
                deduction=round(20 * failure_rate),
                max=20,
                note=f"{analytics.failed_runs} of {total_runs} recent runs failed."
                if total_runs
                else None,
                items=[
                    HealthItem(
                        node_id=m.node_id,
                        message=f"{m.node_id} failed {m.failed} time(s): {m.last_error or 'error'}",
                    )
                    for m in failed_nodes
                ],
            )
        )

    complexity_items: list[HealthItem] = []
    depth = _longest_path(graph)
    if depth > _MAX_DEPTH:
        complexity_items.append(
            HealthItem(message=f"Longest path is {depth} steps (over {_MAX_DEPTH}).")
        )
    fan_out: dict[str, int] = {}
    for edge in graph.edges:
        fan_out[edge.source] = fan_out.get(edge.source, 0) + 1
    for node_id, count in sorted(fan_out.items()):
        if count > _MAX_FAN_OUT:
            complexity_items.append(
                HealthItem(
                    node_id=node_id,
                    message=f"{node_id} fans out to {count} nodes (over {_MAX_FAN_OUT}).",
                )
            )
    factors.append(
        HealthFactor(
            id="complexity",
            label="Complexity",
            deduction=min(10, 5 * len(complexity_items)),
            max=10,
            items=complexity_items,
        )
    )

    score = max(0, 100 - sum(f.deduction for f in factors))
    return GraphHealth(
        graph_id=graph.id, score=score, band=_band(score), factors=factors, computed_at=now_iso()
    )


__all__ = ["GraphHealth", "HealthFactor", "HealthItem", "compute_graph_health"]
