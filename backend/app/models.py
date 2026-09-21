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


# P0 graph foundation, Slice C (design doc, "LangGraph adapter boundary"):
# the capability matrix a RuntimeAdapter exposes, one row per portable
# feature. Exposed at GET /api/runtime-targets/{target_id}/capabilities;
# Studio shows it only when a user encounters a capability diagnostic.
class CapabilityEntry(BaseModel):
    feature: str
    supported: bool
    notes: str | None = None


class CapabilityMatrix(BaseModel):
    target_id: str
    capabilities: list[CapabilityEntry]


# P0 graph foundation, Slice C
# (docs/planning/features/p0-graph-foundation-design-plan.md, "Releases and
# fingerprinting"): an immutable, content-addressed snapshot of a
# GraphDefinition. `graph` is the full canonical graph at publish time;
# `resource_snapshots` embeds every tool/mcp_servers/knowledge resource that
# graph's nodes resolve live today, keyed "{kind}:{id}" — see
# releases.py's resolve_resource_snapshots. Never mutated after creation;
# republishing an unchanged graph returns the existing release instead
# (idempotent on semantic_fingerprint — see releases.py's publish_release).
class GraphRelease(BaseModel):
    id: str
    graph_id: str
    graph: GraphDefinition
    document_fingerprint: str
    semantic_fingerprint: str
    resource_snapshots: dict[str, dict[str, Any]] = Field(default_factory=dict)
    release_notes: str | None = None
    author: str | None = None
    created_at: str
    # The validation report (structural + contract + resource-resolution
    # diagnostics) that was clean at publish time — kept for audit, not
    # re-checked on read.
    diagnostics: list[Diagnostic] = Field(default_factory=list)


# P1 rollout plan, Slice A ("Semantic release comparison") — a single
# node/edge/resource-snapshot delta between two releases' semantic payloads.
# `fields` is only populated when `change == "modified"`: field name ->
# {"from": ..., "to": ...}. Comparing behavior, not raw JSON, per the P0
# doc's "semantic diffs should explain behavior changes" framing — canvas
# position is already excluded, since this reuses fingerprint.py's semantic
# (not document) payload builders.
class GraphElementChange(BaseModel):
    id: str
    change: Literal["added", "removed", "modified"]
    fields: dict[str, dict[str, Any]] = Field(default_factory=dict)


class ReleaseDiff(BaseModel):
    from_release_id: str
    to_release_id: str
    from_semantic_fingerprint: str
    to_semantic_fingerprint: str
    identical: bool
    node_changes: list[GraphElementChange] = Field(default_factory=list)
    edge_changes: list[GraphElementChange] = Field(default_factory=list)
    resource_changes: list[GraphElementChange] = Field(default_factory=list)


class PublishReleaseRequest(BaseModel):
    release_notes: str | None = None
    author: str | None = None


class PublishReleaseResponse(BaseModel):
    release: GraphRelease
    created: bool


class ReleaseRunRequest(BaseModel):
    input: dict[str, Any] = Field(default_factory=dict)
    provider: Literal["ollama", "stub", "openai_compat", "groq", "google", "azure"] | None = None
    model: str | None = None
    api_key: str | None = None


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
    # P0 graph foundation, Slice D (design doc, "Version-pinned runs and
    # Studio UX" — GraphRunIdentity, extended directly onto the run rather
    # than as a nested object). All optional so a run persisted before this
    # slice still deserializes. `graph_fingerprint` is the plain
    # `semantic_fingerprint` of the graph that ran — "what actually ran,"
    # not the release's own `release_semantic_fingerprint` (which also
    # covers resource_snapshots).
    graph_release_id: str | None = None
    graph_fingerprint: str | None = None
    source: Literal["release", "draft_snapshot"] | None = None
    runtime_target: Literal["langgraph"] | None = None
    compiler_version: str | None = None


# P0 graph foundation, Slice D (design doc, "Persistence and API" +
# "Lifecycle"): durably persists the exact normalized graph (and, for a
# draft-sourced run, its resolved resource bindings) a run started from,
# independent of the mutable Draft or the run's own RunSummary/NodeTraces.
# A release-sourced run gets a thin pointer (release_id + graph_fingerprint
# — the GraphRelease itself is already immutable and durable); a
# draft-sourced run embeds the full graph and bindings, since there is no
# other durable record of that exact draft state once editing continues.
# Written once per run_id, before compiling, and never deleted — including
# when the owning graph is deleted (see storage.py's delete_graph, which
# only ever touches the `graph` table/key).
class RunGraphSnapshot(BaseModel):
    run_id: str
    graph_id: str
    source: Literal["release", "draft_snapshot"]
    graph_fingerprint: str
    release_id: str | None = None
    graph: GraphDefinition | None = None
    resource_snapshots: dict[str, dict[str, Any]] | None = None
    created_at: str


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


# P1 rollout plan, Slice B ("Fixture-based simulation and subgraph
# stubbing"): declares a simulate request's graph input plus optional
# per-node mocked/recorded outputs (raw executor-shaped values, not yet
# port-projected — simulate.py projects them the same way a real run's node
# runner would). Not persisted in this slice — the SDK/Studio pass one
# inline per simulate call; a stored, reusable Fixture registry is a
# natural but out-of-scope follow-on (see the P1 doc's parallel "reusable
# entity registry" track).
class Fixture(BaseModel):
    input: dict[str, Any] = Field(default_factory=dict)
    node_outputs: dict[str, Any] = Field(default_factory=dict)


class SimulateResult(BaseModel):
    run: RunSummary
    traces: list[NodeTrace]


# P1 rollout plan, Slice D ("Routing policy lab") — runs a graph against a
# fixture dataset (each entry a `Fixture`, reused from Slice B) and
# aggregates the resulting `route_decisions` into a per-router/branch-node
# distribution: how many dataset runs selected each outgoing target.
# Comparing two such reports (e.g. before/after an edge condition change)
# is `graph-native-control-plane-plan.md` Section 4's "compare routing
# versions over fixture datasets."
class RouteTargetCount(BaseModel):
    target_node_id: str
    count: int


class RouteNodeDistribution(BaseModel):
    node_id: str
    total: int
    targets: list[RouteTargetCount] = Field(default_factory=list)


class RoutingDatasetRunResult(BaseModel):
    fixture_index: int
    run_id: str
    status: str
    route_decisions: list[RouteDecision] = Field(default_factory=list)
    estimated_usd: float
    duration_ms: int | None = None


class RoutingLabReport(BaseModel):
    graph_id: str
    dataset_size: int
    distributions: list[RouteNodeDistribution] = Field(default_factory=list)
    total_estimated_usd: float
    runs: list[RoutingDatasetRunResult] = Field(default_factory=list)


class RunRoutingDatasetRequest(BaseModel):
    dataset: list[Fixture] = Field(default_factory=list)


class RouteTargetCountDelta(BaseModel):
    target_node_id: str
    baseline_count: int
    candidate_count: int


class RouteNodeDistributionDelta(BaseModel):
    node_id: str
    targets: list[RouteTargetCountDelta] = Field(default_factory=list)


class RoutingComparison(BaseModel):
    baseline: RoutingLabReport
    candidate: RoutingLabReport
    distribution_deltas: list[RouteNodeDistributionDelta] = Field(default_factory=list)


# P1 rollout plan, parallel track ("Versioned reusable entity registry") —
# an immutable snapshot of a stored resource's payload at publish time.
# Deliberately narrower than a full entity registry: no branching, no
# approvals, no "current version" pointer distinct from `resource`'s own
# CRUD row — see resource_versions.py's module docstring.
class ResourceVersion(BaseModel):
    version_id: str
    kind: str
    resource_id: str
    payload: dict[str, Any]
    fingerprint: str
    created_at: str


class PublishResourceVersionResponse(BaseModel):
    version: ResourceVersion
    created: bool


# P2, "Cross-cutting policy overlays" (docs/planning/roadmap.md's Strategic
# Roadmap Addendum): a named, time-boxed waiver for one policy diagnostic
# code on one graph — optionally scoped to a single node — so a compile or
# publish gate a policy would otherwise block can proceed deliberately,
# with the waiver itself expiring rather than becoming a silent permanent
# exemption. See policies.py.
class PolicyException(BaseModel):
    id: str
    graph_id: str
    policy_code: str
    node_id: str | None = None
    reason: str | None = None
    created_at: str
    expires_at: str


class CreatePolicyExceptionRequest(BaseModel):
    policy_code: str
    node_id: str | None = None
    reason: str | None = None
    expires_at: str


# P2, "Retrieval/document lineage graph" (docs/planning/roadmap.md's
# Strategic Roadmap Addendum): one durable record of a single knowledge
# chunk actually being retrieved and used to augment an `llm` node's system
# prompt during a run. Recorded by knowledge.py's
# `augment_system_with_knowledge` at retrieval time — independent of
# NodeTrace/RunSummary's own lifecycle, so "which runs used this document"
# stays queryable (via a graph-scoped, document-filterable list) without
# scanning every run's traces.
class KnowledgeLineageEntry(BaseModel):
    id: str
    graph_id: str
    document_id: str
    document_name: str
    chunk_id: str
    run_id: str
    node_id: str
    score: float
    created_at: str
