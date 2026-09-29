"""Agent profiles as runnable things (resource-forms-consistency-plan,
slice 6).

An agent is a graph plus what it layers on top for a run:

- an LLM profile: the run's default provider and model (an explicit
  provider/model on the run request still wins);
- system instructions (a library prompt and/or inline text), prepended to
  every llm/tool_loop node's own system prompt;
- a tool allow-list: when non-empty, every tool the graph can call must be
  on it, or the run is refused with a blocking diagnostic.

`apply_agent` returns a copy of the graph with the instructions written
into each model node's inline `systemPrompt` (a node's bound prompt is
resolved first, so nothing is lost), so the run's durable graph snapshot
records exactly what ran. The stored graph is never modified.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import storage
from .models import Diagnostic, GraphDefinition, NodeType
from .resource_models import AgentProfile

_MODEL_NODE_TYPES = {NodeType.LLM, NodeType.TOOL_LOOP}
# tool_loop's only tool today (nodes.compute_tool_loop).
_TOOL_LOOP_TOOL = "lookup_topic"


class AgentNotRunnable(Exception):
    """The agent's graph or a resource it names is missing."""


@dataclass
class AppliedAgent:
    graph: GraphDefinition
    provider: str | None = None
    model: str | None = None
    diagnostics: list[Diagnostic] = field(default_factory=list)


def normalize_agent_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """An agent as the API returns it: stored records from before slice 6
    (`default_flow_id`, `optional_elements`) read in the current shape."""
    migrated = {
        key: value
        for key, value in payload.items()
        if key not in {"default_flow_id", "optional_elements"}
    }
    migrated["graph_id"] = payload.get("graph_id") or payload.get("default_flow_id") or ""
    migrated.setdefault("tool_ids", [])
    return migrated


def load_agent(agent_id: str) -> AgentProfile | None:
    payload = storage.get_resource("agents", agent_id)
    return AgentProfile.model_validate(payload) if payload else None


def graph_tools(graph: GraphDefinition) -> dict[str, str]:
    """Every tool the graph can call, mapped to the first node that calls it."""
    tools: dict[str, str] = {}
    for node in graph.nodes:
        if node.type == NodeType.TOOL:
            name = node.config.get("toolName") or _TOOL_LOOP_TOOL
            tools.setdefault(str(name), node.id)
        elif node.type == NodeType.TOOL_LOOP:
            tools.setdefault(_TOOL_LOOP_TOOL, node.id)
    return tools


def _prompt_body(prompt_id: str, owner: str) -> str:
    prompt = storage.get_resource("prompts", prompt_id)
    if prompt is None:
        raise AgentNotRunnable(f"{owner}: prompt {prompt_id!r} not found")
    return str(prompt.get("body", ""))


def agent_instructions(agent: AgentProfile) -> str:
    parts = []
    if agent.system_prompt_id:
        parts.append(_prompt_body(agent.system_prompt_id, f"agent {agent.id!r}"))
    if agent.system_instructions and agent.system_instructions.strip():
        parts.append(agent.system_instructions.strip())
    return "\n\n".join(part for part in parts if part.strip())


def apply_agent(agent: AgentProfile, graph: GraphDefinition) -> AppliedAgent:
    provider = model = None
    if agent.llm_profile_id:
        profile = storage.get_resource("llm_profiles", agent.llm_profile_id)
        if profile is None:
            raise AgentNotRunnable(
                f"agent {agent.id!r}: LLM profile {agent.llm_profile_id!r} not found"
            )
        provider = profile.get("model_provider") or None
        model = profile.get("model") or None

    diagnostics: list[Diagnostic] = []
    if agent.tool_ids:
        allowed = set(agent.tool_ids)
        for tool, node_id in graph_tools(graph).items():
            if tool not in allowed:
                diagnostics.append(
                    Diagnostic(
                        severity="error",
                        code="AGENT_TOOL_NOT_ALLOWED",
                        node_id=node_id,
                        message=f"Agent {agent.name!r} doesn't allow tool {tool!r}.",
                        blocking=True,
                        category="policy",
                        remediation=(
                            "Add the tool to the agent's allowed tools, or remove it from "
                            "the graph."
                        ),
                    )
                )

    instructions = agent_instructions(agent)
    applied = graph.model_copy(deep=True)
    if instructions:
        for node in applied.nodes:
            if node.type not in _MODEL_NODE_TYPES:
                continue
            bound = node.config.get("systemPromptId")
            own = (
                _prompt_body(bound, f"node {node.id!r}")
                if isinstance(bound, str) and bound.strip()
                else node.config.get("systemPrompt") or ""
            )
            node.config = {
                **{key: value for key, value in node.config.items() if key != "systemPromptId"},
                "systemPrompt": f"{instructions}\n\n{own}".strip(),
            }
    return AppliedAgent(graph=applied, provider=provider, model=model, diagnostics=diagnostics)
