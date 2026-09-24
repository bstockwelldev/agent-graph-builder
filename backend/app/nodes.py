"""Node executors -- the only place that knows what each node TYPE does.

The compiler/runtime never special-cases graph shape; it just calls whichever
of these functions matches a node's `type` and lets the graph structure (via
edges) determine what runs next. This is what makes execution "follow the
graph" instead of being hard-coded per workflow.

Each `compute_*` function returns (input_repr, output, state_delta):
- input_repr / output are recorded verbatim for node-level observability.
- state_delta is merged into the LangGraph run state (see runtime.py).
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from . import storage
from .builtin_tools import (
    BUILTIN_CALCULATOR_ID,
    BUILTIN_WEB_SEARCH_ID,
    CalculatorError,
    calculator,
    web_search,
)
from .events import RunEventBus
from .guardrails import check_guardrail
from .knowledge import augment_system_with_knowledge
from .mcp.client import call_mcp_tool
from .models import EdgeKind, GraphDefinition, GraphEdge, GraphNode
from .ports import default_input_port, resolve_node_input
from .providers.base import ChatModel
from .resource_models import McpServerConfig, ToolDefinition
from .rubric import analyze_prompt

NodeResult = tuple[Any, Any, dict[str, Any]]


class RunPaused(Exception):
    """Raised by `compute_human_gate` when a checkpoint has not been
    approved yet. Caught specifically in runtime.py's `_make_node_runner`
    (studio-consolidation Phase 2) — distinct from a real failure: the run
    stops cleanly with status="paused" rather than "failed", resumable via
    `POST /api/runs/{id}/resume`.
    """

    def __init__(self, node_id: str) -> None:
        self.node_id = node_id
        super().__init__(f"human_gate node {node_id!r} is awaiting approval")


# Intentionally tiny, deterministic "knowledge base" for the one demo tool.
# Proves the tool-node seam; nothing more is needed for the POC.
LOOKUP_TABLE: dict[str, str] = {
    "kubernetes": (
        "Kubernetes is a container orchestration platform for automating deployment, "
        "scaling, and management of containerized applications."
    ),
    "docker": (
        "Docker packages an application and its dependencies into a portable container image."
    ),
    "database index": (
        "A database index is a data structure that speeds up row lookups at the cost of "
        "extra writes and storage."
    ),
    "load balancer": (
        "A load balancer distributes incoming network traffic across multiple backend "
        "servers to improve availability and throughput."
    ),
    "cache": (
        "A cache stores frequently accessed data in fast storage to reduce latency and "
        "load on the primary data source."
    ),
    "api": (
        "An API (application programming interface) defines how software components "
        "communicate with each other."
    ),
}


def lookup_topic(topic: str) -> str:
    normalized = topic.lower()
    for keyword, fact in LOOKUP_TABLE.items():
        if keyword in normalized:
            return fact
    return f"No lookup entry found for '{topic}'. Try: {', '.join(LOOKUP_TABLE)}."


@dataclass
class ExecContext:
    run_id: str
    graph: GraphDefinition
    bus: RunEventBus
    chat_model_factory: Callable[[str | None], ChatModel]
    # Shadow copy of the LangGraph RunState, kept in sync by
    # runtime.py's `_make_node_runner` after every node completes.
    # Exists only so a `human_gate` pause (studio-consolidation Phase 2) can
    # snapshot "everything computed so far" for `POST /api/runs/{id}/resume`
    # — LangGraph's own `ainvoke()` does not hand back partial state on the
    # exception path `RunPaused` takes, so this tracks it independently.
    state_snapshot: dict[str, Any] = field(
        default_factory=lambda: {"variables": {}, "node_outputs": {}, "route_decisions": []}
    )
    # Needed only to persist a resumable RunPauseState (studio-consolidation
    # Phase 2, human_gate) — no node executor reads these.
    compiled_workflow_id: str | None = None
    resolved_provider: str | None = None
    requested_model: str | None = None
    api_key: str | None = None
    # P0 graph foundation, Slice C (see releases.py's resolve_resource_
    # snapshots): set only for `source: "release"` runs, to the release's
    # embedded `{"{kind}:{id}": payload}` map. `None` means a draft-sourced
    # run — unchanged behavior, live `storage.get_resource` lookups. `_resolve_resource`
    # below is the one place that reads this.
    release_resource_snapshots: dict[str, dict[str, Any]] | None = None
    # P1 rollout plan, Slice B ("Fixture-based simulation"): node ids whose
    # `state["node_outputs"]` entry was pre-seeded from a Fixture rather than
    # produced by a real resume-after-pause. Only distinguishes which event
    # flag `runtime.py`'s `_make_node_runner` emits (`fixture` vs.
    # `replayed`) for the pre-seeded early-return branch both cases share —
    # no other executor reads this.
    fixture_node_outputs: frozenset[str] | None = None
    # Counterfactual replay (STO-609, replay.py): router/branch node id ->
    # the target node it must select regardless of its input, and llm /
    # tool_loop node id -> the chat model to use instead of the run's.
    forced_routes: dict[str, str] | None = None
    node_chat_models: dict[str, ChatModel] | None = None


def _resolve_resource(ctx: ExecContext, kind: str, resource_id: str) -> dict[str, Any] | None:
    """Resolves a stored resource (`tools`/`mcp_servers`/`knowledge`) through
    a published release's embedded `resource_snapshots` when this run is
    release-sourced, falling back to live `storage.get_resource` only for
    draft-sourced runs — unchanged behavior there (design doc, "Resource
    reproducibility"). A release-sourced run never falls back to live
    storage even when the snapshot key is absent: that's what makes the
    release's reproducibility guarantee real (publish already blocked on
    `RELEASE_RESOURCE_UNRESOLVED` for anything that wouldn't resolve)."""
    if ctx.release_resource_snapshots is not None:
        return ctx.release_resource_snapshots.get(f"{kind}:{resource_id}")
    return storage.get_resource(kind, resource_id)


def _bound_field(ctx: ExecContext, node: GraphNode, field: str, kind: str, attr: str) -> Any:
    """Wave 4a registry binding (backend/app/bindings.py): the `attr` of the
    resource `node.config[field]` points at, through the release-aware
    `_resolve_resource` -- or None when the field is unbound. Compile
    already blocks an unresolved binding (UNRESOLVED_RESOURCE_BINDING), so a
    missing resource here means it was deleted mid-flight: fail loudly
    rather than silently falling back to stale inline config."""
    resource_id = node.config.get(field)
    if not isinstance(resource_id, str) or not resource_id.strip():
        return None
    resource = _resolve_resource(ctx, kind, resource_id)
    if resource is None:
        raise ValueError(
            f"{node.type.value} node {node.id!r}: {field}: {kind} {resource_id!r} not found"
        )
    return resource.get(attr)


def _prompt_template(ctx: ExecContext, node: GraphNode) -> str:
    bound = _bound_field(ctx, node, "promptId", "prompts", "body")
    return bound if bound is not None else node.config.get("template", "{question}")


def _system_prompt(ctx: ExecContext, node: GraphNode) -> str | None:
    bound = _bound_field(ctx, node, "systemPromptId", "prompts", "body")
    return bound if bound is not None else node.config.get("systemPrompt")


def _node_model(ctx: ExecContext, node: GraphNode) -> str | None:
    # A bound LLM profile supplies the node's model; the run-level model
    # override (runtime.py chat_model_factory) still wins over it.
    bound = _bound_field(ctx, node, "llmProfileId", "llm_profiles", "model")
    return bound if bound else node.config.get("model")


def _chat_model(ctx: ExecContext, node: GraphNode) -> ChatModel:
    """The node's chat model: a counterfactual override when one is set,
    otherwise the run's factory with the node's (or bound profile's) model."""
    if ctx.node_chat_models and node.id in ctx.node_chat_models:
        return ctx.node_chat_models[node.id]
    return ctx.chat_model_factory(_node_model(ctx, node))


def _forced_edge(ctx: ExecContext, node: GraphNode, outgoing: list[GraphEdge]) -> GraphEdge | None:
    """The out-edge a counterfactual replay pins this router/branch to."""
    target = (ctx.forced_routes or {}).get(node.id)
    if target is None:
        return None
    return next((edge for edge in outgoing if edge.target == target), None)


def get_upstream_output(node: GraphNode, state: dict[str, Any], graph: GraphDefinition) -> Any:
    """Return the output of whichever incoming edge's source node actually ran.

    A node can have multiple incoming edges (e.g. Output has one from each
    router branch), but only one branch executes per run, so we return the
    first source whose output is already recorded.

    P0 graph foundation, Slice A: thin wrapper over `ports.resolve_node_input`
    — this node's own default input port resolved against the new port-keyed
    `state["node_outputs"]` shape. Kept as a wrapper, not deleted, so every
    executor call site below is unchanged.
    """
    input_port = default_input_port(node)
    if input_port is None:
        return ""
    return resolve_node_input(node, input_port.id, state, graph)


async def compute_input(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    variable_name = node.config.get("variableName", "question")
    raw_input = state["variables"].get("__run_input__", {})
    value = raw_input.get(variable_name, raw_input.get("question", ""))
    return raw_input, value, {"variables": {variable_name: value}}


async def compute_prompt(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    template = _prompt_template(ctx, node)
    upstream = get_upstream_output(node, state, ctx.graph)
    format_kwargs = {**state["variables"], "upstream": upstream}
    try:
        rendered = template.format(**format_kwargs)
    except (KeyError, IndexError):
        rendered = template
    return format_kwargs, rendered, {}


async def compute_llm(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    upstream = get_upstream_output(node, state, ctx.graph)
    system_prompt = _system_prompt(ctx, node)
    chat_model = _chat_model(ctx, node)
    # RAG augmentation (studio-consolidation Phase 5): a no-op unless
    # ctx.graph has an uploaded knowledge base (see knowledge.py) — degrades
    # silently to the unmodified prompt on any failure, so a knowledge
    # lookup issue never fails the run. Slice C: a release-sourced run
    # resolves its knowledge base through the release's embedded snapshot
    # instead of live storage (see `_resolve_resource`).
    knowledge_kwargs: dict[str, Any] = (
        {"resource_snapshot": _resolve_resource(ctx, "knowledge", ctx.graph.id)}
        if ctx.release_resource_snapshots is not None
        else {}
    )
    augmented_system_prompt = await augment_system_with_knowledge(
        system_prompt or "",
        ctx.graph.id,
        str(upstream),
        run_id=ctx.run_id,
        node_id=node.id,
        **knowledge_kwargs,
    )
    output = await chat_model.generate(
        system_prompt=augmented_system_prompt, user_prompt=str(upstream)
    )
    input_repr = {
        "provider": chat_model.provider_name,
        "model": chat_model.model,
        "systemPrompt": system_prompt,
        "userPrompt": upstream,
    }
    return input_repr, output, {}


async def compute_tool(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    """Resolution order (studio-consolidation Phase 3 adds the last two):
    `lookup_topic` (the original POC tool, kept for the demo graph) -> the
    two builtins (`web_search`, `calculator`) -> a registered `ToolDefinition`
    (dispatched to its bound MCP server, or a mock echo if unbound) -> error.
    """
    tool_name = node.config.get("toolName", "lookup_topic")
    input_variable = node.config.get("inputVariable", "question")
    raw_input = state["variables"].get(input_variable, "")

    if tool_name == "lookup_topic":
        output = lookup_topic(str(raw_input))
        return {"toolName": tool_name, "topic": raw_input}, output, {}

    if tool_name == BUILTIN_WEB_SEARCH_ID:
        output = await web_search(str(raw_input))
        return {"toolName": tool_name, "query": raw_input}, output, {}

    if tool_name == BUILTIN_CALCULATOR_ID:
        try:
            output = calculator(str(raw_input))
        except CalculatorError as exc:
            raise ValueError(f"calculator error: {exc}") from exc
        return {"toolName": tool_name, "expression": raw_input}, output, {}

    resource = _resolve_resource(ctx, "tools", tool_name)
    if resource is None:
        raise ValueError(
            f"Unsupported tool: {tool_name!r} (not 'lookup_topic', a builtin, or a registered tool)"
        )
    tool_def = ToolDefinition.model_validate(resource)

    if tool_def.mcp_server_id and tool_def.mcp_tool_name:
        server_resource = _resolve_resource(ctx, "mcp_servers", tool_def.mcp_server_id)
        if server_resource is None:
            raise ValueError(
                f"tool {tool_name!r} references unknown MCP server {tool_def.mcp_server_id!r}"
            )
        server = McpServerConfig.model_validate(server_resource)
        if not server.enabled:
            raise ValueError(f"MCP server {server.id!r} is disabled")
        arguments = raw_input if isinstance(raw_input, dict) else {input_variable: raw_input}
        output = await call_mcp_tool(server, tool_def.mcp_tool_name, arguments)
        input_repr = {
            "toolName": tool_name,
            "mcpServerId": server.id,
            "mcpToolName": tool_def.mcp_tool_name,
            "arguments": arguments,
        }
        return input_repr, output, {}

    # No MCP binding registered — mock echo, matching MUI's agent-tools.ts
    # convention for catalog tools with no real execution body.
    output = {
        "toolId": tool_name,
        "input": raw_input,
        "note": "mock tool: no MCP binding registered",
    }
    return {"toolName": tool_name}, output, {}


async def compute_router(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    upstream = str(get_upstream_output(node, state, ctx.graph))
    classification = upstream.lower()
    outgoing = [e for e in ctx.graph.edges if e.source == node.id]
    conditional_edges = [e for e in outgoing if e.kind == EdgeKind.CONDITIONAL]
    default_edges = [e for e in outgoing if e.kind == EdgeKind.DEFAULT]

    eligible: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for edge in conditional_edges:
        matched = bool(edge.condition) and edge.condition.lower() in classification
        record = {"edgeId": edge.id, "target": edge.target, "condition": edge.condition}
        (eligible if matched else excluded).append(record)

    forced = _forced_edge(ctx, node, outgoing)
    if forced is not None:
        selected = forced
        rationale = "forced"
    elif eligible:
        selected_edge_id = eligible[0]["edgeId"]
        selected = next(e for e in conditional_edges if e.id == selected_edge_id)
        rationale = "conditional_match"
    elif default_edges:
        selected = default_edges[0]
        rationale = "default_fallback"
    else:
        raise ValueError(
            f"Router node {node.id!r} has no matching conditional edge and no default edge"
        )

    ctx.bus.emit(
        "edge.selected",
        {
            "eligible": eligible,
            "excluded": excluded,
            "selectedEdgeId": selected.id,
            "selectedTargetNodeId": selected.target,
            "rationale": rationale,
        },
        node_id=node.id,
    )

    output = {
        "classification": upstream,
        "selectedTargetNodeId": selected.target,
        "rationale": rationale,
    }
    route_decision = {
        "nodeId": node.id,
        "selectedEdgeId": selected.id,
        "selectedTargetNodeId": selected.target,
    }
    return {"upstream": upstream}, output, {"route_decisions": [route_decision]}


async def compute_output(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    upstream = get_upstream_output(node, state, ctx.graph)
    return upstream, upstream, {"result": upstream}


# ---------------------------------------------------------------------------
# Studio-consolidation Phase 2 executors (see
# docs/planning/features/studio-consolidation-plan.md). Node types absorbed
# from micro-ui-agent-builder's FlowStep vocabulary in Phase 1 gain their
# runtime behavior here.
# ---------------------------------------------------------------------------


async def compute_guardrail(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    """Validates the upstream text; raises (failing the run, per
    _make_node_runner's exception handling) on the first violation found.
    """
    upstream = str(get_upstream_output(node, state, ctx.graph))
    allow_urls = bool(node.config.get("allowUrls", False))
    check_guardrail(upstream, allow_urls=allow_urls)
    return {"allowUrls": allow_urls}, upstream, {}


async def compute_rubric(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    """Runs static findings on the upstream text; blocks the run only when
    `rubricFailOnFindings` is set and findings exist — otherwise passes
    upstream through with the findings attached for observability.
    """
    upstream = str(get_upstream_output(node, state, ctx.graph))
    findings = analyze_prompt(upstream)
    fail_on_findings = bool(node.config.get("rubricFailOnFindings", False))
    if fail_on_findings and findings:
        raise ValueError(f"rubric findings blocked this run: {'; '.join(findings)}")
    output = {"findings": findings, "text": upstream}
    return {"rubricFailOnFindings": fail_on_findings}, output, {}


async def compute_branch(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    """Substring gate with real conditional out-edges — a genuine upgrade
    over micro-ui-agent-builder's `branch` step, which is a whole-run
    precondition with no alternate targets. Mirrors `compute_router`'s
    edge-selection and `edge.selected` emission, keyed on a single boolean
    match rather than a classification string. An empty `content` always
    matches (a documentation-only gate, same convention as an empty
    conditional-edge `condition`).
    """
    upstream = str(get_upstream_output(node, state, ctx.graph))
    required = (node.config.get("content") or "").strip()
    matched = not required or required.lower() in upstream.lower()

    outgoing = [e for e in ctx.graph.edges if e.source == node.id]
    conditional_edges = [e for e in outgoing if e.kind == EdgeKind.CONDITIONAL]
    default_edges = [e for e in outgoing if e.kind == EdgeKind.DEFAULT]

    eligible: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    if matched and conditional_edges:
        eligible = [
            {"edgeId": e.id, "target": e.target, "condition": e.condition}
            for e in conditional_edges
        ]
    else:
        excluded = [
            {"edgeId": e.id, "target": e.target, "condition": e.condition}
            for e in conditional_edges
        ]

    forced = _forced_edge(ctx, node, outgoing)
    if forced is not None:
        selected = forced
        rationale = "forced"
    elif eligible:
        selected = next(e for e in conditional_edges if e.id == eligible[0]["edgeId"])
        rationale = "branch_matched"
    elif default_edges:
        selected = default_edges[0]
        rationale = "branch_fallback"
    else:
        raise ValueError(
            f"Branch node {node.id!r} has no matching conditional edge and no default edge"
        )

    ctx.bus.emit(
        "edge.selected",
        {
            "eligible": eligible,
            "excluded": excluded,
            "selectedEdgeId": selected.id,
            "selectedTargetNodeId": selected.target,
            "rationale": rationale,
        },
        node_id=node.id,
    )

    output = {
        "matched": matched,
        "requiredSubstring": required,
        "selectedTargetNodeId": selected.target,
        "rationale": rationale,
    }
    route_decision = {
        "nodeId": node.id,
        "selectedEdgeId": selected.id,
        "selectedTargetNodeId": selected.target,
    }
    return (
        {"upstream": upstream, "requiredSubstring": required},
        output,
        {"route_decisions": [route_decision]},
    )


# `tool_loop` node convention: a provider-agnostic, text-based tool-call
# marker instead of each of the six provider adapters implementing native
# function-calling (a much larger, separate effort not needed to prove this
# node type). Real providers may or may not follow it faithfully; the Stub
# adapter (`providers/stub.py`) follows it deterministically so the loop is
# fully testable offline. Only the existing `lookup_topic` tool is wired —
# Phase 3's tool registry replaces this with real per-flow tool binding.
_TOOL_CALL_PATTERN = re.compile(
    r"^\s*TOOL_CALL:\s*lookup_topic:\s*(.+)$", re.IGNORECASE | re.DOTALL
)


def _tool_loop_system_prompt(base: str | None) -> str:
    instructions = (
        "You can call the lookup_topic tool for factual lookups. To call it, respond with "
        "exactly: TOOL_CALL: lookup_topic: <topic>. Otherwise, give your final answer directly "
        "with no prefix."
    )
    return f"{base}\n\n{instructions}" if base else instructions


def _render_tool_loop_prompt(question: str, tool_results: list[dict[str, str]]) -> str:
    if not tool_results:
        return str(question)
    results_text = "\n".join(f"Tool result for '{r['topic']}': {r['result']}" for r in tool_results)
    return f"{question}\n\n{results_text}\n\nGive your final answer now."


def _parse_tool_call(response: str) -> str | None:
    match = _TOOL_CALL_PATTERN.match(response.strip())
    return match.group(1).strip() if match else None


async def compute_tool_loop(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    upstream = get_upstream_output(node, state, ctx.graph)
    base_system_prompt = _system_prompt(ctx, node)
    max_iterations = int(node.config.get("maxToolIterations", 1))
    chat_model = _chat_model(ctx, node)

    tool_results: list[dict[str, str]] = []
    transcript: list[dict[str, Any]] = []
    final_output: str | None = None

    for iteration in range(1, max_iterations + 1):
        user_prompt = _render_tool_loop_prompt(str(upstream), tool_results)
        response = await chat_model.generate(
            system_prompt=_tool_loop_system_prompt(base_system_prompt), user_prompt=user_prompt
        )
        transcript.append({"iteration": iteration, "modelResponse": response})

        topic = _parse_tool_call(response)
        if topic is None:
            final_output = response
            break

        result = lookup_topic(topic)
        tool_results.append({"topic": topic, "result": result})
        transcript.append(
            {"iteration": iteration, "toolCall": "lookup_topic", "topic": topic, "result": result}
        )

    if final_output is None:
        final_output = (
            f"[tool_loop] Iteration limit ({max_iterations}) reached without a final answer."
        )

    input_repr = {
        "provider": chat_model.provider_name,
        "model": chat_model.model,
        "systemPrompt": base_system_prompt,
        "userPrompt": upstream,
        "maxToolIterations": max_iterations,
        "transcript": transcript,
    }
    return input_repr, final_output, {}


async def compute_code_exec(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    """Declares code-execution expectations and passes upstream through
    unexecuted — no sandbox runner is wired in this phase, per the POC
    simplifications table in README.md.
    """
    upstream = get_upstream_output(node, state, ctx.graph)
    language = node.config.get("codeExecLanguage") or "unspecified"
    contract = node.config.get("content", "")
    tool_name = node.config.get("toolName")
    output = {
        "status": "not_executed",
        "language": language,
        "contract": contract,
        "toolName": tool_name,
        "note": (
            "No sandbox executor is wired yet (studio-consolidation Phase 2); "
            "validated and passed through only."
        ),
        "upstream": upstream,
    }
    input_repr = {"language": language, "contract": contract, "toolName": tool_name}
    return input_repr, output, {}


async def compute_human_gate(
    node: GraphNode, state: dict[str, Any], ctx: ExecContext
) -> NodeResult:
    """Pauses the run on first execution (raises `RunPaused`, handled in
    runtime.py); once resumed with this node's id marked approved in
    `state["variables"]["__approved_gates__"]`, passes upstream through.
    """
    approved_gates = state["variables"].get("__approved_gates__", {})
    if not approved_gates.get(node.id, False):
        raise RunPaused(node.id)
    upstream = get_upstream_output(node, state, ctx.graph)
    return {"content": node.config.get("content", ""), "approved": True}, upstream, {}


EXECUTORS: dict[str, Callable[[GraphNode, dict[str, Any], ExecContext], Awaitable[NodeResult]]] = {
    "input": compute_input,
    "prompt": compute_prompt,
    "llm": compute_llm,
    "tool": compute_tool,
    "router": compute_router,
    "output": compute_output,
    "guardrail": compute_guardrail,
    "rubric": compute_rubric,
    "branch": compute_branch,
    "tool_loop": compute_tool_loop,
    "code_exec": compute_code_exec,
    "human_gate": compute_human_gate,
}
