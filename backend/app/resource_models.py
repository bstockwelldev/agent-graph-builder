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
from typing import Literal

from pydantic import BaseModel, Field

from .models import Fixture


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


class McpServerConfig(BaseModel):
    id: str
    name: str
    url: str
    transport: Literal["http", "sse", "stdio"] = "http"
    enabled: bool = True


class AgentProfile(BaseModel):
    id: str
    name: str
    description: str | None = None
    default_flow_id: str | None = None
    system_instructions: str | None = None
    optional_elements: list[str] = Field(default_factory=list)


class LlmProfile(BaseModel):
    id: str
    name: str
    model: str
    model_provider: str | None = None
    description: str | None = None


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


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


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
    "chat_sessions": ChatSession,
    "datasets": FixtureDataset,
}
