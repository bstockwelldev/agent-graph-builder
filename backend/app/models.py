"""Canonical graph schema for the POC.

This is a deliberately trimmed slice of the platform's canonical graph schema
(EDD section 7): no entity version references, no weighted/parallel/approval
edges. Enough to prove the graph-authoring and graph-driven-execution thesis.

P0 graph foundation, Slice A (docs/planning/features/p0-graph-foundation-design-plan.md)
adds `GraphPort`/`PortContract`/`EdgeTransform` as optional fields on `GraphNode`/
`GraphEdge` — extending the existing wire shape rather than replacing it. Nothing
yet resolves or enforces these at runtime; see backend/app/ports.py (Slice A's
behavior-preserving default resolution/projection layer) and Slice B (contract
validation, router/branch port wiring) for what actually reads them.
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


class PortKind(StrEnum):
    """Built-in port contract vocabulary (P0 graph foundation, Slice A)."""

    MESSAGE = "message"
    STRUCTURED_JSON = "structured-json"
    DOCUMENTS = "documents"
    DECISION = "decision"
    ARTIFACT = "artifact"
    TOOL_RESULT = "tool-result"
    APPROVAL = "approval"
    ERROR = "error"


class DataClassification(StrEnum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


class PortContract(BaseModel):
    kind: PortKind
    schema_: dict[str, Any] | None = Field(default=None, alias="schema")
    required: bool = True
    classification: DataClassification | None = None

    model_config = {"populate_by_name": True}


class GraphPort(BaseModel):
    id: str
    name: str
    direction: Literal["input", "output"]
    contract: PortContract


class EdgeTransform(BaseModel):
    """Declarative edge transform (P0 graph foundation, Slice A). Schema
    only — no application logic exists yet; that lands with Slice B's
    contract validation pass."""

    type: Literal["select", "wrap", "format_message", "coerce"]
    pointer: str | None = None
    field: str | None = None
    template: str | None = None
    target_type: Literal["string", "number", "boolean"] | None = None


class GraphNode(BaseModel):
    id: str
    type: NodeType
    position: NodePosition = NodePosition(x=0, y=0)
    config: dict[str, Any] = Field(default_factory=dict)
    input_ports: list[GraphPort] | None = None
    output_ports: list[GraphPort] | None = None
    extensions: dict[str, Any] | None = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: EdgeKind = EdgeKind.SEQUENCE
    # For conditional edges: matched against the nearest upstream router's
    # classification output using simple substring matching, e.g. "technical".
    condition: str | None = None
    source_port: str | None = None
    target_port: str | None = None
    transform: EdgeTransform | None = None
    extensions: dict[str, Any] | None = None


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
    # P0 graph foundation, Slice A: optional fields for Slice B's contract/
    # capability diagnostics; nothing populates them yet.
    category: Literal["structure", "contract", "policy", "capability"] | None = None
    port_id: str | None = None
    target: Literal["langgraph"] | None = None
    remediation: str | None = None


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
    # P0 graph foundation, Slice A: port-keyed (dict[node_id, dict[port_id,
    # value]]), matching runtime.py's RunState.node_outputs shape — must stay
    # in lockstep with it, since this is populated straight from
    # ctx.state_snapshot["node_outputs"] on pause and re-seeded into a
    # resumed run's initial state.
    node_outputs: dict[str, dict[str, Any]] = Field(default_factory=dict)
    route_decisions: list[dict[str, Any]] = Field(default_factory=list)
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
