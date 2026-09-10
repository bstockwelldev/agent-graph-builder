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

from .compiler import compile_graph as validate_and_diagnose
from .events import RunEventBus, create_bus, now_iso
from .models import CompileResult, GraphDefinition, NodeTrace, NodeType, RouteDecision, RunSummary
from .nodes import EXECUTORS, ExecContext
from .providers.base import get_chat_model, resolve_chat_provider
from . import storage


def _merge_dicts(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    return {**a, **b}


class RunState(TypedDict, total=False):
    variables: Annotated[dict[str, Any], _merge_dicts]
    node_outputs: Annotated[dict[str, Any], _merge_dicts]
    route_decisions: Annotated[list[dict[str, Any]], operator.add]
    result: Any


# In-memory stores for live execution. Completed runs are snapshotted to SQLite
# (storage.py); compiled workflows remain process-local only.
COMPILED_WORKFLOWS: dict[str, GraphDefinition] = {}
RUN_STORE: dict[str, RunSummary] = {}
RUN_TRACES: dict[str, dict[str, NodeTrace]] = {}
RUN_BUSES: dict[str, RunEventBus] = {}


def get_run_summary(run_id: str) -> RunSummary | None:
    summary = RUN_STORE.get(run_id)
    if summary is not None:
        return summary
    return storage.get_run(run_id)


def get_run_node_traces(run_id: str) -> list[NodeTrace]:
    if run_id in RUN_TRACES:
        return list(RUN_TRACES[run_id].values())
    return storage.get_run_traces(run_id)


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

    router_node_ids = {n.id for n in graph.nodes if n.type == NodeType.ROUTER}
    router_targets: dict[str, list[str]] = {}

    for edge in graph.edges:
        if edge.source in router_node_ids:
            router_targets.setdefault(edge.source, []).append(edge.target)
            continue
        builder.add_edge(edge.source, edge.target)

    for router_id, targets in router_targets.items():
        builder.add_conditional_edges(router_id, _make_router_path_fn(router_id), targets)

    for node in graph.nodes:
        if node.type == NodeType.OUTPUT:
            builder.add_edge(node.id, END)

    return builder.compile()


def _make_router_path_fn(router_node_id: str):
    def path_fn(state: RunState) -> str:
        for decision in reversed(state.get("route_decisions", [])):
            if decision["nodeId"] == router_node_id:
                return decision["selectedTargetNodeId"]
        raise RuntimeError(f"No route decision recorded for router {router_node_id!r}")

    return path_fn


def _make_node_runner(node, ctx: ExecContext):
    executor = EXECUTORS[node.type.value]

    async def run_node(state: RunState) -> dict[str, Any]:
        ctx.bus.emit("node.started", {"nodeType": node.type.value}, node_id=node.id)
        trace = NodeTrace(node_id=node.id, node_type=node.type, status="running", started_at=now_iso())
        RUN_TRACES[ctx.run_id][node.id] = trace

        try:
            input_repr, output, delta = await executor(node, state, ctx)
        except Exception as exc:  # noqa: BLE001 - surfaced as a node.failed event, then re-raised
            trace.status = "failed"
            trace.error = str(exc)
            trace.completed_at = now_iso()
            ctx.bus.emit("node.failed", {"error": str(exc)}, node_id=node.id)
            raise

        trace.status = "succeeded"
        trace.input = _jsonable(input_repr)
        trace.output = _jsonable(output)
        trace.completed_at = now_iso()
        ctx.bus.emit("node.completed", {"input": trace.input, "output": trace.output}, node_id=node.id)

        delta = dict(delta)
        delta["node_outputs"] = {**delta.get("node_outputs", {}), node.id: output}
        return delta

    return run_node


def _jsonable(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


async def _execute(run_id: str, graph: GraphDefinition, compiled_app, run_input: dict[str, Any]) -> None:
    bus = RUN_BUSES[run_id]
    RUN_STORE[run_id].status = "running"
    bus.emit("run.started", {"graphId": graph.id, "input": run_input})

    initial_state: RunState = {
        "variables": {"__run_input__": run_input},
        "node_outputs": {},
        "route_decisions": [],
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
        bus.emit("run.completed", {"result": _jsonable(final_state.get("result"))})
    except Exception as exc:  # noqa: BLE001 - reported via run status + SSE, not raised further
        RUN_STORE[run_id].status = "failed"
        RUN_STORE[run_id].error = str(exc)
        bus.emit("run.failed", {"error": str(exc)})
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
) -> tuple[str, GraphDefinition, Any, dict[str, Any], RunEventBus]:
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

    def chat_model_factory(node_model: str | None):
        effective_model = model or node_model
        return get_chat_model(effective_model, provider=resolved_provider.value, api_key=api_key)

    ctx = ExecContext(run_id=run_id, graph=graph, bus=bus, chat_model_factory=chat_model_factory)
    compiled_app = _build_langgraph(graph, ctx)
    return run_id, graph, compiled_app, run_input, bus


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
    run_id, graph, compiled_app, run_input, bus = _prepare_run(
        compiled_workflow_id,
        run_input,
        provider=provider,
        model=model,
        api_key=api_key,
    )
    asyncio.create_task(_execute(run_id, graph, compiled_app, run_input))
    return run_id, bus


async def start_run_inline(
    compiled_workflow_id: str,
    run_input: dict[str, Any],
    provider: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> tuple[str, RunEventBus]:
    """Create the run and await execution in this request (Vercel / serverless)."""
    run_id, graph, compiled_app, run_input, bus = _prepare_run(
        compiled_workflow_id,
        run_input,
        provider=provider,
        model=model,
        api_key=api_key,
    )
    await _execute(run_id, graph, compiled_app, run_input)
    return run_id, bus


def is_serverless_runtime() -> bool:
    return bool(os.environ.get("VERCEL"))
