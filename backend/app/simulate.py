"""Fixture-based simulation.

Part of the P1 rollout plan (docs/planning/features/p1-rollout-plan.md),
Slice B: "Fixture-based simulation and subgraph stubbing". Runs a graph with
no live tool/LLM calls — static validation via the normal compile path (so
diagnostics match a live compile exactly), `provider` forced to `"stub"`,
and any fixture-declared node outputs pre-seeded so those nodes skip their
live executor entirely. Subgraph stubbing is this same per-node override
generalized to any node type, not a separate mechanism — see
`runtime.py`'s `_project_fixture_node_outputs` and `_make_node_runner`'s
resume-replay early-return branch, which both paths share.
"""

from __future__ import annotations

from . import runtime
from .models import Diagnostic, Fixture, GraphDefinition, NodeType, SimulateResult

# ROUTER/BRANCH pick their outgoing edge from a `route_decisions` entry that
# only their own executor (compute_router/compute_branch) writes — stubbing
# either node's output would skip that write and leave
# `_make_route_decision_path_fn` with nothing to replay, so a fixture may
# stub what a router/branch reads or produces downstream, never the
# router/branch node itself.
_ROUTING_NODE_TYPES = frozenset({NodeType.ROUTER, NodeType.BRANCH})


class SimulateBlocked(Exception):
    """Raised when a fixture targets an unknown or unstubbable node, or the
    graph itself fails compile validation. `diagnostics` mirrors
    `CompileResult`/`ReleasePublishBlocked`'s shape for the route layer."""

    def __init__(self, diagnostics: list[Diagnostic]) -> None:
        self.diagnostics = diagnostics
        super().__init__("simulation blocked by diagnostics")


def _validate_fixture_targets(graph: GraphDefinition, fixture: Fixture) -> list[Diagnostic]:
    node_ids = {n.id for n in graph.nodes}
    routing_ids = {n.id for n in graph.nodes if n.type in _ROUTING_NODE_TYPES}
    diagnostics: list[Diagnostic] = []
    for node_id in fixture.node_outputs:
        if node_id in routing_ids:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    category="structure",
                    code="FIXTURE_ROUTER_OUTPUT_NOT_STUBBABLE",
                    node_id=node_id,
                    message=(
                        f"Fixture cannot stub router/branch node {node_id!r} directly — its "
                        "routing decision must still be simulated. Stub an upstream or "
                        "downstream node instead."
                    ),
                    blocking=True,
                )
            )
        elif node_id not in node_ids:
            diagnostics.append(
                Diagnostic(
                    severity="error",
                    category="structure",
                    code="FIXTURE_UNKNOWN_NODE",
                    node_id=node_id,
                    message=f"Fixture references unknown node {node_id!r}",
                    blocking=True,
                )
            )
    return diagnostics


async def simulate_graph(
    graph: GraphDefinition,
    fixture: Fixture,
    *,
    release_resource_snapshots: dict[str, dict[str, object]] | None = None,
    release_id: str | None = None,
) -> SimulateResult:
    """Compiles and validates `graph` — identical diagnostics to a live
    compile, the exit gate this slice must hold — then executes it with
    `fixture.input`, forcing `provider="stub"` (no live LLM calls, ever) and
    pre-seeding `fixture.node_outputs` (no live executor call for those
    nodes). Raises `SimulateBlocked` on blocking diagnostics from either the
    fixture-target check or the compile pass.
    """
    fixture_diagnostics = _validate_fixture_targets(graph, fixture)
    if fixture_diagnostics:
        raise SimulateBlocked(fixture_diagnostics)

    compile_result = runtime.compile_workflow(graph)
    if not compile_result.ok or compile_result.compiled_workflow_id is None:
        raise SimulateBlocked(compile_result.diagnostics)

    run_id, _bus = await runtime.start_run_inline(
        compile_result.compiled_workflow_id,
        fixture.input,
        provider="stub",
        release_resource_snapshots=release_resource_snapshots,
        release_id=release_id,
        fixture_node_outputs=fixture.node_outputs or None,
    )
    summary = runtime.get_run_summary(run_id)
    if summary is None:
        raise RuntimeError(f"simulated run {run_id!r} vanished immediately after completion")
    traces = runtime.get_run_node_traces(run_id)
    return SimulateResult(run=summary, traces=traces)


__all__ = ["SimulateBlocked", "simulate_graph"]
