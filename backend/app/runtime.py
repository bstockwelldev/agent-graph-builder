"""Compiles a canonical GraphDefinition into a real LangGraph StateGraph and
executes it (EDD sections 9.3 / 14).

This is the load-bearing proof for thesis #2: execution literally follows
`add_node`/`add_edge` calls derived from the graph JSON. There is no
hard-coded "step 1, step 2, step 3" anywhere in this file -- add a node/edge
in the editor and this module drives a different path automatically.
"""

from __future__ import annotations

import asyncio
import json
import operator
import os
import uuid
from typing import Annotated, Any, TypedDict

from langgraph.graph import END, START, StateGraph

from . import storage
from .compiler import compile_graph as validate_and_diagnose
from .events import RunEventBus, create_bus, now_iso
from .models import (
    CompileResult,
    GraphDefinition,
    NodeTrace,
    NodeType,
    RouteDecision,
    RunPauseState,
    RunSummary,
)
from .nodes import EXECUTORS, ExecContext, RunPaused
from .ports import default_input_port, default_output_port, project_node_output, resolve_node_input
from .providers.base import get_chat_model, resolve_chat_provider
from .telemetry.provider import get_server_telemetry
from .telemetry.types import (
    ServerTelemetry,
    TelemetryModelEvent,
    TelemetryToolEvent,
    TelemetryTraceContext,
)


def _merge_dicts(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    return {**a, **b}


class RunState(TypedDict, total=False):
    variables: Annotated[dict[str, Any], _merge_dicts]
    # P0 graph foundation, Slice A: port-keyed (dict[node_id, dict[port_id,
    # value]]), was dict[node_id, value]. See ports.py for the resolution/
    # projection layer that reads/writes this shape.
    node_outputs: Annotated[dict[str, dict[str, Any]], _merge_dicts]
    route_decisions: Annotated[list[dict[str, Any]], operator.add]
    result: Any


# In-memory stores for live execution. Completed runs are snapshotted to SQLite
# (storage.py); compiled workflows remain process-local only.
COMPILED_WORKFLOWS: dict[str, GraphDefinition] = {}
RUN_STORE: dict[str, RunSummary] = {}
RUN_TRACES: dict[str, dict[str, NodeTrace]] = {}
RUN_BUSES: dict[str, RunEventBus] = {}
# `human_gate` pause checkpoints (studio-consolidation Phase 2). Process-
# local only, same accepted simplification as COMPILED_WORKFLOWS — a paused
# run's RunSummary still persists durably with status="paused", but resuming
# it after a process restart is not possible until this gets a storage.py
# backend (see docs/planning/features/studio-consolidation-plan.md).
RUN_PAUSES: dict[str, RunPauseState] = {}
# Telemetry trace per run (studio-consolidation Phase 5). Process-local like
# the stores above; a resumed run starts a fresh trace, same accepted
# simplification RUN_BUSES already has (see `_prepare_resume`).
RUN_TELEMETRY: dict[str, tuple[ServerTelemetry, str]] = {}


def get_run_summary(run_id: str) -> RunSummary | None:
    summary = RUN_STORE.get(run_id)
    if summary is not None:
        return summary
    return storage.get_run(run_id)


def get_run_node_traces(run_id: str) -> list[NodeTrace]:
    if run_id in RUN_TRACES:
        return list(RUN_TRACES[run_id].values())
    return storage.get_run_traces(run_id)


def get_run_pause_state(run_id: str) -> RunPauseState | None:
    return RUN_PAUSES.get(run_id)


def _persist_run_snapshot(run_id: str) -> None:
    summary = RUN_STORE.get(run_id)
    if summary is None or summary.completed_at is None:
        return
    traces = list(RUN_TRACES.get(run_id, {}).values())
    storage.save_run_snapshot(summary, traces)


def compile_workflow(graph: GraphDefinition) -> CompileResult:
    compiled_workflow_id = f"cwf_{uuid.uuid4().hex[:12]}"
    result = validate_and_diagnose(graph, compiled_workflow_id)
    if result.ok:
        COMPILED_WORKFLOWS[compiled_workflow_id] = graph
    return result


def validate_only(graph: GraphDefinition) -> CompileResult:
    """Validate graph structure without persisting or registering a compiled workflow."""
    return validate_and_diagnose(graph, None)


def _build_langgraph(graph: GraphDefinition, ctx: ExecContext):
    builder = StateGraph(RunState)

    for node in graph.nodes:
        builder.add_node(node.id, _make_node_runner(node, ctx))

    builder.add_edge(START, graph.entry_node_id)

    # ROUTER and BRANCH both pick exactly one outgoing edge at run time (see
    # nodes.py compute_router / compute_branch, generalized here in
    # studio-consolidation Phase 2) and so both need LangGraph conditional
    # edges rather than the straight edges every other node type gets.
    branching_node_ids = {n.id for n in graph.nodes if n.type in (NodeType.ROUTER, NodeType.BRANCH)}
    branching_targets: dict[str, list[str]] = {}

    for edge in graph.edges:
        if edge.source in branching_node_ids:
            branching_targets.setdefault(edge.source, []).append(edge.target)
            continue
        builder.add_edge(edge.source, edge.target)

    for branching_id, targets in branching_targets.items():
        builder.add_conditional_edges(
            branching_id, _make_route_decision_path_fn(branching_id), targets
        )

    for node in graph.nodes:
        if node.type == NodeType.OUTPUT:
            builder.add_edge(node.id, END)

    return builder.compile()


def _make_route_decision_path_fn(branching_node_id: str):
    """Shared by ROUTER and BRANCH nodes: both write a route_decisions entry
    (see nodes.py) before returning; this just replays that decision as the
    LangGraph conditional-edge path.
    """

    def path_fn(state: RunState) -> str:
        for decision in reversed(state.get("route_decisions", [])):
            if decision["nodeId"] == branching_node_id:
                return decision["selectedTargetNodeId"]
        raise RuntimeError(f"No route decision recorded for {branching_node_id!r}")

    return path_fn


def _make_node_runner(node, ctx: ExecContext):
    executor = EXECUTORS[node.type.value]

    async def run_node(state: RunState) -> dict[str, Any]:
        # Resume replay (studio-consolidation Phase 2, human_gate): if this
        # node's output was already computed before a pause — pre-seeded
        # into the resumed run's initial_state from RunPauseState.node_outputs
        # — return it without re-invoking the executor. This is what keeps
        # resume from re-running real side effects (LLM calls, tool calls)
        # for everything upstream of the gate. A node's own id is only ever
        # present in state["node_outputs"] *before* its own run_node call on
        # a resumed run; a fresh run always starts with an empty dict.
        if node.id in state.get("node_outputs", {}):
            cached_projected = state["node_outputs"][node.id]
            # P0 graph foundation, Slice A: cached_projected is the
            # port-keyed dict written by the original (pre-pause) run's
            # project_node_output call, e.g. {"output": "hello"} — unwrap
            # it back to the raw value for trace/event display, matching
            # what the non-replayed path below shows via `_jsonable(output)`.
            output_port = default_output_port(node)
            cached_output = cached_projected.get(output_port.id) if output_port else None
            trace = NodeTrace(
                node_id=node.id,
                node_type=node.type,
                status="succeeded",
                output=_jsonable(cached_output),
                started_at=now_iso(),
                completed_at=now_iso(),
            )
            RUN_TRACES[ctx.run_id][node.id] = trace
            ctx.bus.emit(
                "node.started", {"nodeType": node.type.value, "replayed": True}, node_id=node.id
            )
            ctx.bus.emit(
                "node.completed", {"output": trace.output, "replayed": True}, node_id=node.id
            )
            delta: dict[str, Any] = {"node_outputs": {node.id: cached_projected}}
            _merge_into_snapshot(ctx.state_snapshot, delta)
            return delta

        ctx.bus.emit("node.started", {"nodeType": node.type.value}, node_id=node.id)
        trace = NodeTrace(
            node_id=node.id, node_type=node.type, status="running", started_at=now_iso()
        )
        RUN_TRACES[ctx.run_id][node.id] = trace

        try:
            input_repr, output, delta = await executor(node, state, ctx)
        except RunPaused:
            trace.status = "paused"
            trace.completed_at = now_iso()
            ctx.bus.emit("node.paused", {}, node_id=node.id)
            raise
        except Exception as exc:  # noqa: BLE001 - surfaced as a node.failed event, then re-raised
            trace.status = "failed"
            trace.error = str(exc)
            trace.completed_at = now_iso()
            ctx.bus.emit("node.failed", {"error": str(exc)}, node_id=node.id)
            _record_node_telemetry_error(ctx.run_id, node, exc)
            raise

        trace.status = "succeeded"
        trace.input = _jsonable(input_repr)
        trace.output = _jsonable(output)
        trace.completed_at = now_iso()
        ctx.bus.emit(
            "node.completed", {"input": trace.input, "output": trace.output}, node_id=node.id
        )
        _record_node_telemetry_success(ctx.run_id, node, trace.input)

        delta = dict(delta)
        # P0 graph foundation: project onto the node's declared output
        # port(s) instead of writing the raw executor value directly.
        # `resolved_inputs` re-resolves this node's own input port(s)
        # against the pre-executor state — a cheap dict lookup, not a
        # recomputation of executor side effects — so router/branch's
        # `passthrough` projection (Slice B) can carry the routed message
        # rather than the decision dict, without threading a second return
        # value through every `nodes.py` executor.
        input_port = default_input_port(node)
        resolved_inputs = (
            {input_port.id: resolve_node_input(node, input_port.id, state, ctx.graph)}
            if input_port
            else {}
        )
        delta["node_outputs"] = {
            **delta.get("node_outputs", {}),
            node.id: project_node_output(node, resolved_inputs, output),
        }
        _merge_into_snapshot(ctx.state_snapshot, delta)
        return delta

    return run_node


_MODEL_NODE_TYPES = {NodeType.LLM, NodeType.TOOL_LOOP}
_TOOL_NODE_TYPES = {NodeType.TOOL}


def _record_node_telemetry_success(run_id: str, node, input_repr: Any) -> None:
    """Records a model/tool telemetry event for a completed node
    (studio-consolidation Phase 5). Recorded at the node-runner level, once
    per node, rather than threaded through each `compute_*` executor in
    nodes.py — a disclosed simplification vs. MUI's per-phase
    (preflight/model_selection/generation_start/generation_finish) model
    events, since AGB's `ChatModel.generate` doesn't expose that granularity
    or token usage. `input_repr` is already the dict each executor returns
    for node-trace `input` (see nodes.py's `NodeResult` docstring), so the
    provider/model/toolName fields are read from the same data, not
    recomputed.
    """
    entry = RUN_TELEMETRY.get(run_id)
    if entry is None or not isinstance(input_repr, dict):
        return
    telemetry, trace_id = entry
    if node.type in _MODEL_NODE_TYPES:
        telemetry.record_model_event(
            trace_id,
            TelemetryModelEvent(
                phase="generation_finish",
                provider=input_repr.get("provider"),
                model=input_repr.get("model"),
                metadata={"nodeId": node.id},
            ),
        )
    elif node.type in _TOOL_NODE_TYPES:
        telemetry.record_tool_event(
            trace_id,
            TelemetryToolEvent(
                phase="tool_call_finish",
                tool_name=str(input_repr.get("toolName") or node.type.value),
                metadata={"nodeId": node.id},
            ),
        )


def _record_node_telemetry_error(run_id: str, node, error: BaseException) -> None:
    entry = RUN_TELEMETRY.get(run_id)
    if entry is None:
        return
    telemetry, trace_id = entry
    telemetry.capture_error(trace_id, error, {"nodeId": node.id, "nodeType": node.type.value})


def _start_telemetry_trace(run_id: str, graph_id: str) -> None:
    telemetry = get_server_telemetry()
    trace_id = f"trace_{uuid.uuid4().hex[:12]}"
    context = TelemetryTraceContext(trace_id=trace_id, run_id=run_id, graph_id=graph_id)
    telemetry.start_trace(context)
    RUN_TELEMETRY[run_id] = (telemetry, trace_id)


def _finish_telemetry_trace(
    run_id: str, status: str, metadata: dict[str, Any] | None = None
) -> None:
    entry = RUN_TELEMETRY.pop(run_id, None)
    if entry is None:
        return
    telemetry, trace_id = entry
    telemetry.finish_trace(trace_id, status, metadata)  # type: ignore[arg-type]


def _fail_telemetry_trace(run_id: str, error: BaseException) -> None:
    entry = RUN_TELEMETRY.get(run_id)
    if entry is None:
        return
    telemetry, trace_id = entry
    telemetry.capture_error(trace_id, error)
    _finish_telemetry_trace(run_id, "error", {"error": str(error)})


def _merge_into_snapshot(snapshot: dict[str, Any], delta: dict[str, Any]) -> None:
    """Keeps ExecContext.state_snapshot in sync with the real LangGraph
    RunState after every node completes, so a `human_gate` pause can capture
    "everything computed so far" (see nodes.py ExecContext docstring) even
    though ainvoke() doesn't hand back partial state on that exception path.
    """
    if "variables" in delta:
        snapshot["variables"] = {**snapshot.get("variables", {}), **delta["variables"]}
    if "node_outputs" in delta:
        snapshot["node_outputs"] = {**snapshot.get("node_outputs", {}), **delta["node_outputs"]}
    if "route_decisions" in delta:
        snapshot["route_decisions"] = [
            *snapshot.get("route_decisions", []),
            *delta["route_decisions"],
        ]


def _jsonable(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


async def _execute(ctx: ExecContext, compiled_app, run_input: dict[str, Any]) -> None:
    run_id = ctx.run_id
    graph = ctx.graph
    bus = RUN_BUSES[run_id]
    was_paused = RUN_STORE[run_id].status == "paused"
    RUN_STORE[run_id].status = "running"
    bus.emit(
        "run.resumed" if was_paused else "run.started", {"graphId": graph.id, "input": run_input}
    )

    initial_state: RunState = {
        "variables": dict(ctx.state_snapshot.get("variables", {})),
        "node_outputs": dict(ctx.state_snapshot.get("node_outputs", {})),
        "route_decisions": list(ctx.state_snapshot.get("route_decisions", [])),
        "result": None,
    }

    try:
        final_state = await compiled_app.ainvoke(initial_state)
        RUN_STORE[run_id].status = "succeeded"
        RUN_STORE[run_id].result = final_state.get("result")
        RUN_STORE[run_id].route_decisions = [
            RouteDecision.model_validate(decision)
            for decision in final_state.get("route_decisions") or []
        ]
        RUN_PAUSES.pop(run_id, None)
        bus.emit("run.completed", {"result": _jsonable(final_state.get("result"))})
    except RunPaused as exc:
        RUN_STORE[run_id].status = "paused"
        RUN_PAUSES[run_id] = RunPauseState(
            run_id=run_id,
            graph_id=graph.id,
            compiled_workflow_id=ctx.compiled_workflow_id or "",
            paused_node_id=exc.node_id,
            variables=dict(ctx.state_snapshot.get("variables", {})),
            node_outputs=dict(ctx.state_snapshot.get("node_outputs", {})),
            route_decisions=list(ctx.state_snapshot.get("route_decisions", [])),
            provider=ctx.resolved_provider,
            model=ctx.requested_model,
            api_key=ctx.api_key,
        )
        bus.emit("run.paused", {"nodeId": exc.node_id})
        _finish_telemetry_trace(run_id, "ok", {"paused": True, "nodeId": exc.node_id})
    except Exception as exc:  # noqa: BLE001 - reported via run status + SSE, not raised further
        RUN_STORE[run_id].status = "failed"
        RUN_STORE[run_id].error = str(exc)
        RUN_PAUSES.pop(run_id, None)
        bus.emit("run.failed", {"error": str(exc)})
        _fail_telemetry_trace(run_id, exc)
    else:
        _finish_telemetry_trace(run_id, "ok")
    finally:
        RUN_STORE[run_id].completed_at = now_iso()
        RUN_STORE[run_id].events = bus.collected_events()
        _persist_run_snapshot(run_id)
        bus.close()


def _prepare_run(
    compiled_workflow_id: str,
    run_input: dict[str, Any],
    provider: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> tuple[ExecContext, Any, dict[str, Any]]:
    graph = COMPILED_WORKFLOWS[compiled_workflow_id]
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    resolved_provider = resolve_chat_provider(provider)

    RUN_STORE[run_id] = RunSummary(
        run_id=run_id,
        graph_id=graph.id,
        status="queued",
        input=run_input,
        provider=resolved_provider.value,
        started_at=now_iso(),
    )
    RUN_TRACES[run_id] = {}

    bus = create_bus(run_id)
    RUN_BUSES[run_id] = bus
    _start_telemetry_trace(run_id, graph.id)

    def chat_model_factory(node_model: str | None):
        effective_model = model or node_model
        return get_chat_model(effective_model, provider=resolved_provider.value, api_key=api_key)

    ctx = ExecContext(
        run_id=run_id,
        graph=graph,
        bus=bus,
        chat_model_factory=chat_model_factory,
        state_snapshot={
            "variables": {"__run_input__": run_input},
            "node_outputs": {},
            "route_decisions": [],
        },
        compiled_workflow_id=compiled_workflow_id,
        resolved_provider=resolved_provider.value,
        requested_model=model,
        api_key=api_key,
    )
    compiled_app = _build_langgraph(graph, ctx)
    return ctx, compiled_app, run_input


def start_run(
    compiled_workflow_id: str,
    run_input: dict[str, Any],
    provider: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> tuple[str, RunEventBus]:
    """Creates run bookkeeping and returns immediately; caller schedules `_execute`.

    Use this on long-lived processes (local Docker). Serverless must use
    `start_run_inline` so execution finishes before the isolate freezes.
    """
    ctx, compiled_app, run_input = _prepare_run(
        compiled_workflow_id,
        run_input,
        provider=provider,
        model=model,
        api_key=api_key,
    )
    asyncio.create_task(_execute(ctx, compiled_app, run_input))
    return ctx.run_id, ctx.bus


async def start_run_inline(
    compiled_workflow_id: str,
    run_input: dict[str, Any],
    provider: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> tuple[str, RunEventBus]:
    """Create the run and await execution in this request (Vercel / serverless)."""
    ctx, compiled_app, run_input = _prepare_run(
        compiled_workflow_id,
        run_input,
        provider=provider,
        model=model,
        api_key=api_key,
    )
    await _execute(ctx, compiled_app, run_input)
    return ctx.run_id, ctx.bus


def _prepare_resume(run_id: str) -> tuple[ExecContext, Any, dict[str, Any]] | None:
    """Builds a fresh ExecContext seeded from a `human_gate` pause snapshot,
    approving that gate. Returns None when there is nothing to resume: an
    unknown run_id, an already-resolved run, or (same accepted
    simplification as COMPILED_WORKFLOWS) the compiled workflow was lost to
    a process restart.
    """
    pause = RUN_PAUSES.get(run_id)
    if pause is None:
        return None
    graph = COMPILED_WORKFLOWS.get(pause.compiled_workflow_id)
    if graph is None:
        return None

    run_input = RUN_STORE[run_id].input if run_id in RUN_STORE else {}
    bus = create_bus(run_id)
    RUN_BUSES[run_id] = bus
    _start_telemetry_trace(run_id, graph.id)

    def chat_model_factory(node_model: str | None):
        effective_model = pause.model or node_model
        return get_chat_model(effective_model, provider=pause.provider, api_key=pause.api_key)

    ctx = ExecContext(
        run_id=run_id,
        graph=graph,
        bus=bus,
        chat_model_factory=chat_model_factory,
        state_snapshot={
            "variables": {**pause.variables, "__approved_gates__": {pause.paused_node_id: True}},
            "node_outputs": dict(pause.node_outputs),
            "route_decisions": list(pause.route_decisions),
        },
        compiled_workflow_id=pause.compiled_workflow_id,
        resolved_provider=pause.provider,
        requested_model=pause.model,
        api_key=pause.api_key,
    )
    compiled_app = _build_langgraph(graph, ctx)
    return ctx, compiled_app, run_input


def resume_run(run_id: str) -> tuple[str, RunEventBus] | None:
    """Approves the paused `human_gate` checkpoint and resumes execution in
    the background. Use on long-lived processes; see `resume_run_inline`
    for serverless. Returns None when there is nothing to resume.
    """
    prepared = _prepare_resume(run_id)
    if prepared is None:
        return None
    ctx, compiled_app, run_input = prepared
    asyncio.create_task(_execute(ctx, compiled_app, run_input))
    return ctx.run_id, ctx.bus


async def resume_run_inline(run_id: str) -> tuple[str, RunEventBus] | None:
    """Serverless variant of `resume_run` — awaits execution in this request."""
    prepared = _prepare_resume(run_id)
    if prepared is None:
        return None
    ctx, compiled_app, run_input = prepared
    await _execute(ctx, compiled_app, run_input)
    return ctx.run_id, ctx.bus


def reject_run(run_id: str, reason: str | None = None) -> bool:
    """Rejects a paused `human_gate` checkpoint: marks the run failed
    without resuming execution. Returns False when there is nothing paused
    for this run_id.
    """
    pause = RUN_PAUSES.pop(run_id, None)
    if pause is None or run_id not in RUN_STORE:
        return False
    message = reason or f"Rejected at human_gate {pause.paused_node_id!r}"
    bus = create_bus(run_id)
    RUN_BUSES[run_id] = bus
    RUN_STORE[run_id].status = "failed"
    RUN_STORE[run_id].error = message
    bus.emit("run.failed", {"error": message})
    RUN_STORE[run_id].completed_at = now_iso()
    RUN_STORE[run_id].events = bus.collected_events()
    _persist_run_snapshot(run_id)
    bus.close()
    return True


def is_serverless_runtime() -> bool:
    return bool(os.environ.get("VERCEL"))
