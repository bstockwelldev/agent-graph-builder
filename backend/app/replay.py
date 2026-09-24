"""Historical replay.

Part of the P1 rollout plan (docs/planning/features/p1-rollout-plan.md),
Slice C: "Historical replay". Opens a past run's exact `RunGraphSnapshot`
read-only and re-executes it with every non-routing node's original output
frozen — a full, byte-identical reproduction of the historical run, no live
tool/LLM calls at all. This is the `studio-ux-revision-plan.md` "Replay
run" slot: "Opens immutable workflow version in read-only execution mode."

Counterfactual replay (STO-609) builds on the same mechanism: a
`ReplayRequest` can pin routers/branches to a different target
(`forced_routes`) and give LLM/tool_loop nodes a different provider/model
(`model_overrides`). Every node reachable downstream of a change is
"affected" and recomputes instead of using its recorded output -- on the
stub provider unless `live_affected` asks for the original run's provider.
A swapped node itself runs on its chosen provider when that provider has
credentials, and on the stub (flagged `stub_fallback`) when it doesn't.
Everything else stays frozen, exactly as in a plain replay.

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

from typing import Any

from . import runtime, storage
from .models import (
    CounterfactualResult,
    Diagnostic,
    GraphDefinition,
    NodeTrace,
    NodeType,
    ReplayNodeMode,
    ReplayRequest,
)
from .ports import default_output_port
from .provider_credentials import get_provider_credentials
from .providers.base import ChatModel, ChatProvider, get_chat_model
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


def frozen_node_outputs(graph: GraphDefinition, traces: list[NodeTrace]) -> dict[str, Any]:
    """The `Fixture.node_outputs` that reproduce a recorded run: every
    succeeded, non-routing node's original `NodeTrace.output`. Shared by
    `replay_run` and `datasets.build_dataset_from_runs` so a replayed run and
    a run captured into a dataset freeze exactly the same set of nodes.
    """
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
    return {
        trace.node_id: trace.output
        for trace in traces
        if trace.node_id in nodes_by_id
        and trace.node_id not in routing_ids
        and trace.status == "succeeded"
        and default_output_port(nodes_by_id[trace.node_id]) is not None
    }


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


_MODEL_NODE_TYPES = frozenset({NodeType.LLM, NodeType.TOOL_LOOP})


def _counterfactual_error(message: str, node_id: str | None = None) -> Diagnostic:
    return Diagnostic(
        severity="error",
        category="structure",
        code="REPLAY_COUNTERFACTUAL_INVALID",
        node_id=node_id,
        message=message,
        blocking=True,
    )


def _validate_request(graph: GraphDefinition, request: ReplayRequest) -> list[Diagnostic]:
    nodes_by_id = {n.id: n for n in graph.nodes}
    diagnostics: list[Diagnostic] = []
    for node_id, target in request.forced_routes.items():
        node = nodes_by_id.get(node_id)
        if node is None or node.type not in _ROUTING_NODE_TYPES:
            diagnostics.append(
                _counterfactual_error(f"{node_id!r} is not a router or branch node.", node_id)
            )
            continue
        targets = {e.target for e in graph.edges if e.source == node_id}
        if target not in targets:
            diagnostics.append(
                _counterfactual_error(
                    f"{target!r} is not a target of {node_id!r}'s out-edges.", node_id
                )
            )
    for node_id, override in request.model_overrides.items():
        node = nodes_by_id.get(node_id)
        if node is None or node.type not in _MODEL_NODE_TYPES:
            diagnostics.append(
                _counterfactual_error(f"{node_id!r} is not an llm or tool_loop node.", node_id)
            )
            continue
        try:
            ChatProvider(override.provider)
        except ValueError:
            diagnostics.append(
                _counterfactual_error(f"Unknown provider {override.provider!r}.", node_id)
            )
    return diagnostics


def _downstream(graph: GraphDefinition, starts: set[str]) -> set[str]:
    """`starts` plus every node reachable from them along graph edges."""
    adjacency: dict[str, list[str]] = {}
    for edge in graph.edges:
        adjacency.setdefault(edge.source, []).append(edge.target)
    seen = set(starts)
    frontier = list(starts)
    while frontier:
        for target in adjacency.get(frontier.pop(), []):
            if target not in seen:
                seen.add(target)
                frontier.append(target)
    return seen


def _provider_usable(provider: str) -> bool:
    """Stub/ollama need no key; the others need one configured."""
    credentials = get_provider_credentials(provider)
    return not credentials["requires_api_key"] or bool(credentials["configured"])


def _override_models(request: ReplayRequest) -> tuple[dict[str, ChatModel], set[str]]:
    """Chat models for swapped nodes, and which of them fell back to stub."""
    models: dict[str, ChatModel] = {}
    fallbacks: set[str] = set()
    for node_id, override in request.model_overrides.items():
        if _provider_usable(override.provider):
            models[node_id] = get_chat_model(override.model, provider=override.provider)
        else:
            models[node_id] = get_chat_model(override.model, provider=ChatProvider.STUB.value)
            fallbacks.add(node_id)
    return models, fallbacks


def _changed_nodes(original: list[NodeTrace], replayed: list[NodeTrace]) -> list[str]:
    before = {t.node_id: t.output for t in original}
    after = {t.node_id: t.output for t in replayed}
    return sorted(
        node_id
        for node_id in before.keys() | after.keys()
        if before.get(node_id, ...) != after.get(node_id, ...)
    )


async def replay_run(run_id: str, request: ReplayRequest | None = None) -> CounterfactualResult:
    """Re-executes `run_id`'s exact original graph read-only. With no (or an
    empty) `request`, every non-routing node's original `NodeTrace.output`
    is frozen -- no live tool or LLM calls, a byte-identical reproduction.
    With a counterfactual `request`, nodes downstream of its changes
    recompute (see the module docstring). Raises `ReplayNotFound` when the
    run or its durable records are gone, `ReplayBlocked` when the run never
    succeeded, the request is invalid, or the graph no longer compiles.
    """
    request = request or ReplayRequest()
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
    request_diagnostics = _validate_request(graph, request)
    if request_diagnostics:
        raise ReplayBlocked(request_diagnostics)

    original_traces = runtime.get_run_node_traces(run_id)
    changed = set(request.forced_routes) | set(request.model_overrides)
    affected = _downstream(graph, changed) if changed else set()
    if changed:
        # Input nodes also populate `state["variables"]` as a side effect,
        # which a frozen (fixture) node skips -- and recomputed nodes such as
        # a tool reading `inputVariable` need those. They're deterministic
        # from the run input, so re-running them changes nothing else.
        affected |= {n.id for n in graph.nodes if n.type == NodeType.INPUT}
    fixture_node_outputs = {
        node_id: output
        for node_id, output in frozen_node_outputs(graph, original_traces).items()
        if node_id not in affected
    }

    compile_result = runtime.compile_workflow(graph)
    if not compile_result.ok or compile_result.compiled_workflow_id is None:
        raise ReplayBlocked(compile_result.diagnostics)

    node_chat_models, fallbacks = _override_models(request)
    provider = "stub"
    if (
        request.live_affected
        and original_summary.provider
        and _provider_usable(original_summary.provider)
    ):
        provider = original_summary.provider

    replay_run_id, _bus = await runtime.start_run_inline(
        compile_result.compiled_workflow_id,
        original_summary.input,
        provider=provider,
        release_resource_snapshots=resource_snapshots if release_id else None,
        release_id=release_id,
        fixture_node_outputs=fixture_node_outputs,
        forced_routes=dict(request.forced_routes),
        node_chat_models=node_chat_models,
    )
    summary = runtime.get_run_summary(replay_run_id)
    if summary is None:
        raise RuntimeError(f"replay run {replay_run_id!r} vanished immediately after completion")
    traces = runtime.get_run_node_traces(replay_run_id)

    node_modes: dict[str, ReplayNodeMode] = {}
    for trace in traces:
        if trace.node_id in request.forced_routes:
            node_modes[trace.node_id] = "forced"
        elif trace.node_id in fallbacks:
            node_modes[trace.node_id] = "stub_fallback"
        elif trace.node_id in request.model_overrides:
            node_modes[trace.node_id] = "live"
        elif trace.node_id in fixture_node_outputs:
            node_modes[trace.node_id] = "frozen"
        else:
            node_modes[trace.node_id] = "recomputed"

    return CounterfactualResult(
        run=summary,
        traces=traces,
        original_run_id=run_id,
        counterfactual=bool(changed),
        original_traces=original_traces,
        changed_nodes=_changed_nodes(original_traces, traces),
        node_modes=node_modes,
    )


__all__ = ["ReplayNotFound", "ReplayBlocked", "replay_run"]
