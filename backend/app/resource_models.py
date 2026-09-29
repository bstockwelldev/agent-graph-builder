"""Stored resource models for the studio-consolidation program's Phase 3
(docs/planning/features/studio-consolidation-plan.md): prompts, tools, MCP
servers, agents, and LLM profiles, modeled on
`packages/shared/src/schemas.ts` in micro-ui-agent-builder.

Field names are plain snake_case, matching this repo's own wire convention
(`entry_node_id`, `run_id`, …) rather than MUI's camelCase Zod schemas —
there is no existing camelCase consumer of these models to stay compatible
with, unlike `RouteDecision`'s deliberate alias.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from .models import Fixture, TransformType
from .transforms import transform_field_error


class PromptTemplate(BaseModel):
    id: str
    name: str
    body: str


class ToolDefinition(BaseModel):
    id: str
    description: str
    # JSON-schema-shaped string, catalog display only (matches MUI's
    # toolDefinitionSchema convention) — not parsed/enforced in this phase.
    parameters_json: str = "{}"
    requires_approval: bool = False
    # Optional MCP binding: when set, `tool` nodes calling this id dispatch
    # to `mcp_server_id`'s `mcp_tool_name` (backend/app/mcp/client.py)
    # instead of a builtin or a mock echo. See nodes.py compute_tool.
    mcp_server_id: str | None = None
    mcp_tool_name: str | None = None

    @model_validator(mode="after")
    def _mcp_binding_is_whole(self) -> ToolDefinition:
        # Half a binding would silently run as the mock echo (nodes.py).
        if bool(self.mcp_server_id) != bool(self.mcp_tool_name):
            raise ValueError("an MCP tool needs both mcp_server_id and mcp_tool_name")
        return self


class McpServerConfig(BaseModel):
    id: str
    name: str
    url: str
    transport: Literal["http", "sse", "stdio"] = "http"
    enabled: bool = True


class AgentProfile(BaseModel):
    """A graph packaged to run as an agent (resource-forms-consistency-plan,
    slice 6): the graph it runs, and what it layers on top -- an LLM profile
    (the run's default provider/model), system instructions prepended to
    every llm/tool_loop node's system prompt, and a tool allow-list.
    Applied per run by agents.apply_agent; the graph itself is unchanged."""

    id: str
    name: str
    description: str | None = None
    graph_id: str = Field(min_length=1)
    llm_profile_id: str | None = None
    # A library prompt and/or inline text; both are used when set (prompt first).
    system_prompt_id: str | None = None
    system_instructions: str | None = None
    # Empty = any tool the graph uses; otherwise every tool node (and
    # tool_loop's built-in lookup) must be listed.
    tool_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _migrate(cls, data: Any) -> Any:
        # Before slice 6: `default_flow_id` was the graph, and
        # `optional_elements` was never read by anything.
        if isinstance(data, dict):
            data = dict(data)
            legacy_graph = data.pop("default_flow_id", None)
            if not data.get("graph_id") and legacy_graph:
                data["graph_id"] = legacy_graph
            data.pop("optional_elements", None)
        return data


class LlmProfile(BaseModel):
    id: str
    name: str
    model: str
    model_provider: str | None = None
    description: str | None = None


class TransformDefinition(BaseModel):
    """A reusable, named transform (the Transforms library): bound by id from
    an edge (`transform.transform_id`) or a transform node (`transformId`),
    and pinned into release snapshots like any other bound resource."""

    id: str
    name: str
    description: str | None = None
    type: TransformType
    pointer: str | None = None
    field: str | None = None
    template: str | None = None
    target_type: Literal["string", "number", "boolean"] | None = None

    @model_validator(mode="after")
    def _complete(self) -> TransformDefinition:
        error = transform_field_error(self)
        if error:
            raise ValueError(error)
        return self


class FixtureDataset(BaseModel):
    """A named, reusable list of simulation fixtures (each a
    `models.Fixture`: `{input, node_outputs}`) for the Routing Lab, so a
    dataset survives closing the panel instead of living only in a
    textarea. `graph_id` is a provenance hint, not a constraint: any graph
    can run any dataset (node ids in `node_outputs` that don't exist in the
    target graph are reported by `simulate_graph` as `FIXTURE_UNKNOWN_NODE`).
    `source="runs"` datasets were captured from historical runs by
    `datasets.build_dataset_from_runs`.
    """

    id: str
    name: str
    description: str | None = None
    graph_id: str | None = None
    fixtures: list[Fixture] = Field(default_factory=list)
    source: Literal["manual", "runs"] = "manual"
    source_run_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ChatRunRef(BaseModel):
    """A graph run started from Chat (studio-ux-gap-remediation-plan.md §4,
    STO-600). The run itself goes through the ordinary run API
    (`POST /api/runs` / `POST /api/graph-releases/{id}/runs`); the chat
    message only keeps a reference, and the Studio's run card reads live
    status from the run endpoints."""

    run_id: str
    graph_id: str
    graph_name: str
    source: Literal["draft", "release"] = "draft"
    release_id: str | None = None
    input: dict[str, Any] = Field(default_factory=dict)
    # Set when the run was started as an agent (`/run @agent`).
    agent_id: str | None = None
    agent_name: str | None = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    run: ChatRunRef | None = None


class ChatSession(BaseModel):
    """A direct model scratchpad (studio-consolidation Phase 8) -- bypasses
    the graph engine entirely, chatting straight to a chosen provider/model.
    Not a Run: no compile step, no node-by-node execution, no relation to any
    graph_id."""

    id: str
    title: str
    provider: str
    model: str
    messages: list[ChatMessage] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# Resource kind -> model, used generically by main.py's CRUD routes and by
# compiler.py's tool-binding check.
RESOURCE_MODELS: dict[str, type[BaseModel]] = {
    "prompts": PromptTemplate,
    "tools": ToolDefinition,
    "mcp_servers": McpServerConfig,
    "agents": AgentProfile,
    "llm_profiles": LlmProfile,
    "transforms": TransformDefinition,
    "chat_sessions": ChatSession,
    "datasets": FixtureDataset,
}
