"""Canonical graph schema for the POC.

This is a deliberately trimmed slice of the platform's canonical graph schema
(EDD section 7): no ports/schemaRef objects, no entity version references, no
weighted/parallel/approval edges. Enough to prove the graph-authoring and
graph-driven-execution thesis.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field

from .events import PlatformEvent


class NodeType(StrEnum):
    INPUT = "input"
    PROMPT = "prompt"
    LLM = "llm"
    TOOL = "tool"
    ROUTER = "router"
    OUTPUT = "output"
    # Added for the studio-consolidation program (see
    # docs/planning/features/studio-consolidation-plan.md, Phase 1): absorbed
    # from micro-ui-agent-builder's FlowStep node vocabulary. Schema-only in
    # Phase 1 — runtime executors land in Phase 2 (backend/app/nodes.py); a
    # graph containing one of these blocks compile with NODE_TYPE_NOT_EXECUTABLE
    # until then (see compiler.py).
    GUARDRAIL = "guardrail"
    RUBRIC = "rubric"
    HUMAN_GATE = "human_gate"
    TOOL_LOOP = "tool_loop"
    CODE_EXEC = "code_exec"
    BRANCH = "branch"


class EdgeKind(StrEnum):
    SEQUENCE = "sequence"
    CONDITIONAL = "conditional"
    DEFAULT = "default"


class NodePosition(BaseModel):
    x: float
    y: float


class GraphNode(BaseModel):
    id: str
    type: NodeType
    position: NodePosition = NodePosition(x=0, y=0)
    config: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: EdgeKind = EdgeKind.SEQUENCE
    # For conditional edges: matched against the nearest upstream router's
    # classification output using simple substring matching, e.g. "technical".
    condition: str | None = None


class GraphDefinition(BaseModel):
    id: str
    name: str
    entry_node_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    orientation: Literal["auto", "horizontal", "vertical"] = "auto"
    updated_at: str | None = None


class Diagnostic(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    node_id: str | None = None
    edge_id: str | None = None
    message: str
    blocking: bool = False


class CompileResult(BaseModel):
    graph_id: str
    compiled_workflow_id: str | None
    diagnostics: list[Diagnostic]
    ok: bool


class RunRequest(BaseModel):
    graph_id: str
    input: dict[str, Any] = Field(default_factory=dict)
    provider: Literal["ollama", "stub", "openai_compat", "groq", "google", "azure"] | None = None
    model: str | None = None
    api_key: str | None = None


class CreateGraphRequest(BaseModel):
    name: str = "Untitled graph"
    template: Literal["blank", "demo"] = "blank"


class RunResumeRequest(BaseModel):
    """Body for POST /api/runs/{id}/resume (studio-consolidation Phase 2,
    human_gate). approve=False rejects the checkpoint and fails the run
    without resuming execution."""

    approve: bool = True
    reason: str | None = None


class RouteDecision(BaseModel):
    node_id: str = Field(alias="nodeId")
    selected_edge_id: str = Field(alias="selectedEdgeId")
    selected_target_node_id: str = Field(alias="selectedTargetNodeId")

    model_config = {"populate_by_name": True}


class RunSummary(BaseModel):
    run_id: str
    graph_id: str
    # "paused" added for the `human_gate` node type (studio-consolidation
    # Phase 2): a run stopped at a human-approval checkpoint, resumable via
    # POST /api/runs/{id}/resume. completed_at is set when paused too (this
    # invocation's event bus has closed), same as succeeded/failed.
    status: Literal["queued", "running", "succeeded", "failed", "paused"]
    result: Any | None = None
    input: dict[str, Any] = Field(default_factory=dict)
    provider: str | None = None
    error: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    route_decisions: list[RouteDecision] = Field(default_factory=list)
    events: list[PlatformEvent] = Field(default_factory=list)


class NodeTrace(BaseModel):
    node_id: str
    node_type: NodeType
    status: Literal["running", "succeeded", "failed", "paused"]
    input: Any = None
    output: Any = None
    started_at: str
    completed_at: str | None = None
    error: str | None = None


class RunPauseState(BaseModel):
    """Persisted checkpoint for a run stopped at a `human_gate` node.

    Added for studio-consolidation Phase 2. Deliberately process-local only
    for now (kept in runtime.py's RUN_PAUSES, not storage.py) — the same
    accepted simplification `COMPILED_WORKFLOWS` already makes in this file;
    durable pause state across restarts/serverless isolates is a follow-up
    (see docs/planning/features/studio-consolidation-plan.md, Phase 2 notes).
    """

    run_id: str
    graph_id: str
    compiled_workflow_id: str
    paused_node_id: str
    variables: dict[str, Any] = Field(default_factory=dict)
    node_outputs: dict[str, Any] = Field(default_factory=dict)
    route_decisions: list[dict[str, Any]] = Field(default_factory=list)
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
