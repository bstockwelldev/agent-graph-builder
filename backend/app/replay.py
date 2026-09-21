"""Historical replay.

Part of the P1 rollout plan (docs/planning/features/p1-rollout-plan.md),
Slice C: "Historical replay". Opens a past run's exact `RunGraphSnapshot`
read-only and re-executes it with every non-routing node's original output
frozen — a full, byte-identical reproduction of the historical run, no live
tool/LLM calls at all. This is the `studio-ux-revision-plan.md` "Replay
run" slot: "Opens immutable workflow version in read-only execution mode."

First-cut scope is full reproduction, not counterfactual replay (swapping
one node's output for a different model/version, or freezing all nodes but
one) — that's named in the P1 doc as later follow-on work within this same
slice.

Reuses Slice B's fixture mechanism directly: freezing every node's
original output *is* a fixture, just one that happens to cover the whole
graph instead of a hand-picked subset. ROUTER/BRANCH nodes are excluded
from the frozen set for the same reason Slice B excludes them from fixture
targets — their routing decision must still be computed, not stubbed — but
since their upstream inputs are frozen to the original run's exact values,
`compute_router`/`compute_branch`'s deterministic classification logic
reproduces the same decision, and only the originally-taken branch's nodes
are ever visited.

Deliberately does not reuse `runtime.py`'s `"replayed"` `NodeTrace`/event
flag — that flag is human_gate resume bookkeeping within a single run, an
unrelated concept. This module's public name is `replay_run`, and its
route is `POST /api/runs/{run_id}/replay`, so the two never get conflated
in code, diagnostics, or the API surface.
"""

from __future__ import annotations

from . import runtime, storage
from .models import Diagnostic, GraphDefinition, NodeType, SimulateResult
from .ports import default_output_port
from .releases import get_release

_ROUTING_NODE_TYPES = frozenset({NodeType.ROUTER, NodeType.BRANCH})


class ReplayNotFound(Exception):
    """The run, its graph snapshot, or (for a release-sourced run) the
    release it points to can no longer be found."""


class ReplayBlocked(Exception):
    """The run exists but can't be replayed as-is: it never reached
    `succeeded`, or its graph no longer compiles. Mirrors
    `SimulateBlocked`/`ReleasePublishBlocked`'s shape."""

    def __init__(self, diagnostics: list[Diagnostic]) -> None:
        self.diagnostics = diagnostics
        super().__init__("replay blocked by diagnostics")


def _resolve_replay_graph(
    run_id: str,
) -> tuple[GraphDefinition, dict[str, dict[str, object]] | None, str | None]:
    """Resolves the exact graph (+ resource_snapshots, for a release-sourced
    run) this run's `RunGraphSnapshot` points to — a release pointer fetched
    fresh (never re-embedded, since the release already stores it durably),
    or the embedded draft graph for a draft-sourced run."""
    snapshot = storage.get_run_graph_snapshot(run_id)
    if snapshot is None:
        raise ReplayNotFound(f"no graph snapshot recorded for run {run_id!r}")

    if snapshot["source"] == "release":
        release_id = snapshot["release_id"]
        graph_id = storage.get_release_graph_id(release_id)
        release = get_release(release_id, graph_id) if graph_id is not None else None
        if release is None:
            raise ReplayNotFound(f"release {release_id!r} for run {run_id!r} no longer exists")
        return release.graph, release.resource_snapshots, release.id

    graph = GraphDefinition.model_validate(snapshot["graph"])
    return graph, snapshot["resource_snapshots"], None


async def replay_run(run_id: str) -> SimulateResult:
    """Re-executes `run_id`'s exact original graph read-only, with every
    non-routing node's original `NodeTrace.output` frozen — no live tool or
    LLM calls. Raises `ReplayNotFound` when the run or its durable records
    are gone, `ReplayBlocked` when the run never succeeded or its graph no
    longer compiles.
    """
    original_summary = runtime.get_run_summary(run_id)
    if original_summary is None:
        raise ReplayNotFound(f"run {run_id!r} not found")
    if original_summary.status != "succeeded":
        raise ReplayBlocked(
            [
                Diagnostic(
                    severity="error",
                    category="structure",
                    code="REPLAY_RUN_NOT_SUCCEEDED",
                    message=(
                        f"Run {run_id!r} has status {original_summary.status!r} — only a "
                        "succeeded run has a complete set of node outputs to replay."
                    ),
                    blocking=True,
                )
            ]
        )

    graph, resource_snapshots, release_id = _resolve_replay_graph(run_id)
    original_traces = runtime.get_run_node_traces(run_id)
    nodes_by_id = {n.id: n for n in graph.nodes}
    routing_ids = {n.id for n in graph.nodes if n.type in _ROUTING_NODE_TYPES}
    # A node with no output port (only `output` today — see ports.py's
    # catalog) has nothing a fixture can faithfully freeze: its projected
    # `node_outputs` entry is always `{}` regardless of what its executor
    # returned, so the resume-replay early-return branch this reuses would
    # display `None` instead of the original trace value. Such node types
    # are side-effect-free by construction (`compute_output` just forwards
    # its upstream input), so leaving them out and letting them recompute
    # live from already-frozen upstream input reproduces the same value
    # without that display gap.
    fixture_node_outputs = {
        trace.node_id: trace.output
        for trace in original_traces
        if trace.node_id not in routing_ids
        and trace.status == "succeeded"
        and default_output_port(nodes_by_id[trace.node_id]) is not None
    }

    compile_result = runtime.compile_workflow(graph)
    if not compile_result.ok or compile_result.compiled_workflow_id is None:
        raise ReplayBlocked(compile_result.diagnostics)

    replay_run_id, _bus = await runtime.start_run_inline(
        compile_result.compiled_workflow_id,
        original_summary.input,
        provider="stub",
        release_resource_snapshots=resource_snapshots if release_id else None,
        release_id=release_id,
        fixture_node_outputs=fixture_node_outputs,
    )
    summary = runtime.get_run_summary(replay_run_id)
    if summary is None:
        raise RuntimeError(f"replay run {replay_run_id!r} vanished immediately after completion")
    traces = runtime.get_run_node_traces(replay_run_id)
    return SimulateResult(run=summary, traces=traces)


__all__ = ["ReplayNotFound", "ReplayBlocked", "replay_run"]
