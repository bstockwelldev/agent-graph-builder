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

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from .events import RunEventBus
from .models import EdgeKind, GraphDefinition, GraphNode
from .providers.base import ChatModel

NodeResult = tuple[Any, Any, dict[str, Any]]

# Intentionally tiny, deterministic "knowledge base" for the one demo tool.
# Proves the tool-node seam; nothing more is needed for the POC.
LOOKUP_TABLE: dict[str, str] = {
    "kubernetes": "Kubernetes is a container orchestration platform for automating deployment, scaling, and management of containerized applications.",
    "docker": "Docker packages an application and its dependencies into a portable container image.",
    "database index": "A database index is a data structure that speeds up row lookups at the cost of extra writes and storage.",
    "load balancer": "A load balancer distributes incoming network traffic across multiple backend servers to improve availability and throughput.",
    "cache": "A cache stores frequently accessed data in fast storage to reduce latency and load on the primary data source.",
    "api": "An API (application programming interface) defines how software components communicate with each other.",
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


def get_upstream_output(node: GraphNode, state: dict[str, Any], graph: GraphDefinition) -> Any:
    """Return the output of whichever incoming edge's source node actually ran.

    A node can have multiple incoming edges (e.g. Output has one from each
    router branch), but only one branch executes per run, so we return the
    first source whose output is already recorded.
    """
    candidate_sources = [e.source for e in graph.edges if e.target == node.id]
    for source_id in candidate_sources:
        if source_id in state["node_outputs"]:
            return state["node_outputs"][source_id]
    return ""


async def compute_input(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    variable_name = node.config.get("variableName", "question")
    raw_input = state["variables"].get("__run_input__", {})
    value = raw_input.get(variable_name, raw_input.get("question", ""))
    return raw_input, value, {"variables": {variable_name: value}}


async def compute_prompt(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    template = node.config.get("template", "{question}")
    upstream = get_upstream_output(node, state, ctx.graph)
    format_kwargs = {**state["variables"], "upstream": upstream}
    try:
        rendered = template.format(**format_kwargs)
    except (KeyError, IndexError):
        rendered = template
    return format_kwargs, rendered, {}


async def compute_llm(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    upstream = get_upstream_output(node, state, ctx.graph)
    system_prompt = node.config.get("systemPrompt")
    model = node.config.get("model")
    chat_model = ctx.chat_model_factory(model)
    output = await chat_model.generate(system_prompt=system_prompt, user_prompt=str(upstream))
    input_repr = {
        "provider": chat_model.provider_name,
        "model": chat_model.model,
        "systemPrompt": system_prompt,
        "userPrompt": upstream,
    }
    return input_repr, output, {}


async def compute_tool(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    tool_name = node.config.get("toolName", "lookup_topic")
    input_variable = node.config.get("inputVariable", "question")
    topic = state["variables"].get(input_variable, "")
    if tool_name != "lookup_topic":
        raise ValueError(f"Unsupported tool: {tool_name!r} (only 'lookup_topic' is implemented in this POC)")
    output = lookup_topic(str(topic))
    return {"toolName": tool_name, "topic": topic}, output, {}


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

    if eligible:
        selected_edge_id = eligible[0]["edgeId"]
        selected = next(e for e in conditional_edges if e.id == selected_edge_id)
        rationale = "conditional_match"
    elif default_edges:
        selected = default_edges[0]
        rationale = "default_fallback"
    else:
        raise ValueError(f"Router node {node.id!r} has no matching conditional edge and no default edge")

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

    output = {"classification": upstream, "selectedTargetNodeId": selected.target, "rationale": rationale}
    route_decision = {"nodeId": node.id, "selectedEdgeId": selected.id, "selectedTargetNodeId": selected.target}
    return {"upstream": upstream}, output, {"route_decisions": [route_decision]}


async def compute_output(node: GraphNode, state: dict[str, Any], ctx: ExecContext) -> NodeResult:
    upstream = get_upstream_output(node, state, ctx.graph)
    return upstream, upstream, {"result": upstream}


EXECUTORS: dict[str, Callable[[GraphNode, dict[str, Any], ExecContext], Awaitable[NodeResult]]] = {
    "input": compute_input,
    "prompt": compute_prompt,
    "llm": compute_llm,
    "tool": compute_tool,
    "router": compute_router,
    "output": compute_output,
}
