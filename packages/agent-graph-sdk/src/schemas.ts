import { z } from "zod";

/**
 * Runtime-validated schemas for this SDK's wire types (studio-consolidation
 * Phase 4f — see docs/planning/features/studio-consolidation-plan.md). These
 * are the single source of truth: types.ts re-exports each type as
 * `z.infer<typeof xSchema>` instead of hand-mirroring a parallel interface,
 * and `client.ts`'s `jsonFetch` parses every response through the matching
 * schema instead of trusting an unchecked cast.
 */

export const chatProviderSchema = z.enum(["ollama", "stub", "openai_compat", "groq", "google", "azure"]);

export const nodeTypeSchema = z.enum([
  "input",
  "prompt",
  "llm",
  "tool",
  "router",
  "output",
  "guardrail",
  "rubric",
  "human_gate",
  "tool_loop",
  "code_exec",
  "branch",
  // Large-graph complexity, Wave 7c (STO-612): graph-as-node.
  "subgraph",
  // Deterministic reshape step (backend transforms.py).
  "transform",
  // Constrained classifier that routes on a schema-validated outcome
  // (backend/app/decision_models, DecisionConfig).
  "decision",
]);

export const edgeKindSchema = z.enum(["sequence", "conditional", "default"]);
export const graphOrientationSchema = z.enum(["auto", "horizontal", "vertical"]);

export const nodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * P0 graph foundation, Slice A (docs/planning/features/p0-graph-foundation-design-plan.md).
 * Optional additions to graphNodeSchema/graphEdgeSchema below — a legacy
 * graph with none of these fields present must still parse. Nothing yet
 * resolves or enforces these at runtime; see backend/app/ports.py.
 */
export const portKindSchema = z.enum([
  "message",
  "structured-json",
  "documents",
  "decision",
  "artifact",
  "tool-result",
  "approval",
  "error",
]);

export const dataClassificationSchema = z.enum(["public", "internal", "confidential", "restricted"]);

// Nullish, not optional: the API serializes unset fields as null.
export const portContractSchema = z.object({
  kind: portKindSchema,
  schema: z.record(z.string(), z.unknown()).nullish(),
  required: z.boolean().nullish(),
  classification: dataClassificationSchema.nullish(),
});

export const graphPortSchema = z.object({
  id: z.string(),
  name: z.string(),
  direction: z.enum(["input", "output"]),
  contract: portContractSchema,
});

export const transformTypeSchema = z.enum(["select", "wrap", "format_message", "coerce"]);
export const transformTargetTypeSchema = z.enum(["string", "number", "boolean"]);

// Deterministic transform (backend app/transforms.py): inline (`type` plus
// its field) or a Transforms library reference (`transform_id`). Nullish,
// not optional: the API serializes unset fields as null.
// The backend rejects a transform with neither (EdgeTransform validator).
export const edgeTransformSchema = z.object({
  type: transformTypeSchema.nullish(),
  pointer: z.string().nullish(),
  field: z.string().nullish(),
  template: z.string().nullish(),
  target_type: transformTargetTypeSchema.nullish(),
  transform_id: z.string().nullish(),
});

export const graphNodeSchema = z.object({
  id: z.string(),
  type: nodeTypeSchema,
  position: nodePositionSchema,
  config: z.record(z.string(), z.unknown()),
  input_ports: z.array(graphPortSchema).nullish(),
  output_ports: z.array(graphPortSchema).nullish(),
  extensions: z.record(z.string(), z.unknown()).nullish(),
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: edgeKindSchema,
  condition: z.string().nullish(),
  source_port: z.string().nullish(),
  target_port: z.string().nullish(),
  transform: edgeTransformSchema.nullish(),
  extensions: z.record(z.string(), z.unknown()).nullish(),
});

/** Wave 7b (STO-611): a display-only frame around a set of nodes. */
export const graphGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string().nullish(),
  node_ids: z.array(z.string()),
  collapsed: z.boolean().optional(),
});

/** Wave 7d (STO-622): a display-only architecture layer. */
export const graphLayerSchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string().nullish(),
});

/** A comment on a sticky note. */
export const graphNoteReplySchema = z.object({
  id: z.string(),
  text: z.string(),
  author: z.string().nullish(),
  created_at: z.string().nullish(),
});

/** A display-only sticky note on the canvas, with its comment thread; `node_id` pins it to a node. */
export const graphNoteSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  color: z.string().nullish(),
  author: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  node_id: z.string().nullish(),
  resolved: z.boolean().optional(),
  replies: z.array(graphNoteReplySchema).optional(),
});

export const graphDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  entry_node_id: z.string(),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  orientation: graphOrientationSchema.optional(),
  updated_at: z.string().nullish(),
  groups: z.array(graphGroupSchema).nullish(),
  layers: z.array(graphLayerSchema).nullish(),
  notes: z.array(graphNoteSchema).nullish(),
});

// Chat context binding (studio-ux-gap-remediation-plan.md §3, STO-596):
// sent alongside a chat message so the backend can build a system prompt
// from the studio's current graph/selection/run state. All fields
// optional and mirrored 1:1 with the backend's ChatContext
// (backend/app/chat_context.py) — an empty/omitted context reproduces the
// pre-existing behavior exactly.
export const chatContextSchema = z.object({
  graph: graphDefinitionSchema.nullish(),
  graph_id: z.string().nullish(),
  selected_node_id: z.string().nullish(),
  selected_edge_id: z.string().nullish(),
  run_id: z.string().nullish(),
});

export const diagnosticSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  node_id: z.string().nullish(),
  edge_id: z.string().nullish(),
  message: z.string(),
  blocking: z.boolean(),
  // P0 graph foundation: optional fields populated by Slice B's contract
  // pass (backend/app/contracts.py) — category/port_id on every contract
  // diagnostic; target is reserved for Slice C/D's capability pass.
  category: z.enum(["structure", "contract", "policy", "capability"]).nullish(),
  port_id: z.string().nullish(),
  target: z.enum(["langgraph"]).nullish(),
  remediation: z.string().nullish(),
  // Configurable policies (STO-608): a policy diagnostic that will block
  // publishing unless waived -- including a non-blocking `block_publish` warning.
  blocks_publish: z.boolean().nullish(),
});

export const compileResultSchema = z.object({
  graph_id: z.string(),
  compiled_workflow_id: z.string().nullable(),
  diagnostics: z.array(diagnosticSchema),
  ok: z.boolean(),
});

/**
 * P0 graph foundation, Slice C (docs/planning/features/p0-graph-foundation-design-plan.md,
 * "Releases and fingerprinting"). An immutable, content-addressed snapshot
 * of a GraphDefinition — see backend/app/releases.py's publish_release.
 * Never mutated after creation.
 */
export const graphReleaseSchema = z.object({
  id: z.string(),
  graph_id: z.string(),
  graph: graphDefinitionSchema,
  document_fingerprint: z.string(),
  semantic_fingerprint: z.string(),
  resource_snapshots: z.record(z.string(), z.record(z.string(), z.unknown())),
  release_notes: z.string().nullish(),
  author: z.string().nullish(),
  created_at: z.string(),
  diagnostics: z.array(diagnosticSchema),
});

export const publishReleaseResponseSchema = z.object({
  release: graphReleaseSchema,
  created: z.boolean(),
});

// GET /api/graphs/{id}/releases's compact per-entry shape (storage.py's
// get_release_index) — not the full GraphRelease payload.
export const releaseIndexEntrySchema = z.object({
  release_id: z.string(),
  semantic_fingerprint: z.string(),
  document_fingerprint: z.string(),
  created_at: z.string(),
});

// design doc, "LangGraph adapter boundary" — GET
// /api/runtime-targets/{target_id}/capabilities.
export const capabilityEntrySchema = z.object({
  feature: z.string(),
  supported: z.boolean(),
  notes: z.string().nullish(),
});

export const capabilityMatrixSchema = z.object({
  target_id: z.string(),
  capabilities: z.array(capabilityEntrySchema),
});

// P1 rollout plan, Slice A ("Semantic release comparison") — GET
// /api/graph-releases/{id}/compare/{other_id}. See
// backend/app/fingerprint.py's diff_graphs and backend/app/models.py's
// GraphElementChange/ReleaseDiff.
export const graphElementChangeSchema = z.object({
  id: z.string(),
  change: z.enum(["added", "removed", "modified"]),
  fields: z.record(z.string(), z.record(z.string(), z.unknown())),
});

export const releaseDiffSchema = z.object({
  from_release_id: z.string(),
  // null when the "to" side is an unpublished draft (STO-609); `to_label`
  // then reads "Draft".
  to_release_id: z.string().nullable(),
  to_label: z.string().nullish(),
  from_semantic_fingerprint: z.string(),
  to_semantic_fingerprint: z.string(),
  identical: z.boolean(),
  node_changes: z.array(graphElementChangeSchema),
  edge_changes: z.array(graphElementChangeSchema),
  resource_changes: z.array(graphElementChangeSchema),
});

export const routeDecisionSchema = z.object({
  nodeId: z.string(),
  selectedEdgeId: z.string(),
  selectedTargetNodeId: z.string(),
});

export const platformEventSchema = z.object({
  event_type: z.enum([
    "run.started",
    "run.completed",
    "run.failed",
    "run.paused",
    "run.resumed",
    // P0 graph foundation, Slice D — emitted once, right after the run's
    // RunGraphSnapshot is durably persisted, before compiling.
    "run.snapshot_created",
    "node.started",
    "node.completed",
    "node.failed",
    "node.paused",
    "edge.selected",
    "subgraph.completed",
  ]),
  run_id: z.string(),
  node_id: z.string().nullish(),
  occurred_at: z.string(),
  sequence: z.number(),
  payload: z.record(z.string(), z.unknown()),
});

export const runSummarySchema = z.object({
  run_id: z.string(),
  graph_id: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed", "paused"]),
  /** The human_gate node a paused run is waiting at. */
  paused_node_id: z.string().nullish(),
  /** The agent profile the run was started as. */
  agent_id: z.string().nullish(),
  result: z.unknown(),
  input: z.record(z.string(), z.unknown()).optional(),
  provider: z.string().nullish(),
  error: z.string().nullish(),
  started_at: z.string().nullish(),
  completed_at: z.string().nullish(),
  route_decisions: z.array(routeDecisionSchema).optional(),
  events: z.array(platformEventSchema).optional(),
  // P0 graph foundation, Slice D (design doc, "Version-pinned runs and
  // Studio UX" — GraphRunIdentity, extended directly onto the run). All
  // nullish so a run persisted before this slice still parses.
  graph_release_id: z.string().nullish(),
  graph_fingerprint: z.string().nullish(),
  source: z.enum(["release", "draft_snapshot"]).nullish(),
  runtime_target: z.enum(["langgraph"]).nullish(),
  compiler_version: z.string().nullish(),
  // Wave 7c: set on a subgraph node's nested child run.
  parent_run_id: z.string().nullish(),
  parent_node_id: z.string().nullish(),
});

// P0 graph foundation, Slice D — GET /api/runs/{run_id}/snapshot. A
// release-sourced run's `graph`/`resource_snapshots` are omitted (null):
// the GraphRelease itself already durably stores them.
export const runGraphSnapshotSchema = z.object({
  run_id: z.string(),
  graph_id: z.string(),
  source: z.enum(["release", "draft_snapshot"]),
  graph_fingerprint: z.string(),
  release_id: z.string().nullish(),
  graph: graphDefinitionSchema.nullish(),
  resource_snapshots: z.record(z.string(), z.record(z.string(), z.unknown())).nullish(),
  created_at: z.string(),
});

export const nodeTraceSchema = z.object({
  node_id: z.string(),
  node_type: nodeTypeSchema,
  status: z.enum(["running", "succeeded", "failed", "paused"]),
  input: z.unknown(),
  output: z.unknown(),
  started_at: z.string(),
  completed_at: z.string().nullish(),
  error: z.string().nullish(),
});

// P1 rollout plan, Slice B ("Fixture-based simulation and subgraph
// stubbing") — POST /api/graphs/{id}/simulate and
// /api/graph-releases/{id}/simulate. See backend/app/simulate.py and
// backend/app/models.py's Fixture/SimulateResult. `node_outputs` maps a
// node id to the raw mocked/recorded value that node's executor would
// otherwise have produced — not yet port-projected.
/** What a scored eval checks a fixture's run against (backend/app/evals.py). */
export const fixtureExpectationSchema = z.object({
  output: z.unknown().optional(),
  contains: z.array(z.string()).optional(),
  regex: z.string().nullish(),
  /** JSON pointer ("/answer/label") -> expected value. */
  json_fields: z.record(z.string(), z.unknown()).optional(),
  /** Router/branch node id -> the node it should route to. */
  route: z.record(z.string(), z.string()).optional(),
});

export const fixtureSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  node_outputs: z.record(z.string(), z.unknown()),
  expected: fixtureExpectationSchema.nullish(),
});

/**
 * A named, saved list of Routing Lab fixtures (backend/app/resource_models.py's
 * `FixtureDataset`). `graph_id` is a provenance hint, not a constraint.
 * `source: "runs"` datasets were captured from historical runs.
 */
export const fixtureDatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  graph_id: z.string().nullish(),
  fixtures: z.array(fixtureSchema),
  source: z.enum(["manual", "runs"]),
  source_run_ids: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

// Scored evals (backend/app/evals.py, resource_models.py's EvalSuite).
export const evalScorerKindSchema = z.enum(["exact", "contains", "regex", "json_field", "route", "rubric"]);
export const evalScorerSchema = z.object({
  kind: evalScorerKindSchema,
  weight: z.number().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
});
export const evalSuiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  graph_id: z.string(),
  dataset_id: z.string(),
  scorers: z.array(evalScorerSchema).optional(),
  pass_threshold: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export const evalScoreSchema = z.object({
  scorer: z.string(),
  score: z.number(),
  passed: z.boolean(),
  detail: z.string().optional(),
});
export const evalCaseResultSchema = z.object({
  fixture_index: z.number(),
  run_id: z.string().nullish(),
  status: z.string(),
  output: z.unknown().optional(),
  scores: z.array(evalScoreSchema).optional(),
  score: z.number().nullish(),
  passed: z.boolean().nullish(),
  estimated_usd: z.number().optional(),
  error: z.string().nullish(),
});
export const evalRunSchema = z.object({
  id: z.string(),
  suite_id: z.string(),
  graph_id: z.string(),
  release_id: z.string().nullish(),
  provider: z.string(),
  model: z.string().nullish(),
  started_at: z.string(),
  completed_at: z.string(),
  cases: z.array(evalCaseResultSchema).optional(),
  score: z.number().nullish(),
  pass_rate: z.number().nullish(),
  estimated_usd: z.number().optional(),
  duration_ms: z.number().optional(),
  partial: z.boolean().optional(),
});
export const evalCaseDeltaSchema = z.object({
  fixture_index: z.number(),
  baseline_score: z.number().nullish(),
  candidate_score: z.number().nullish(),
  delta: z.number().nullish(),
  baseline_passed: z.boolean().nullish(),
  candidate_passed: z.boolean().nullish(),
});
export const evalComparisonSchema = z.object({
  baseline: evalRunSchema,
  candidate: evalRunSchema,
  score_delta: z.number().nullish(),
  pass_rate_delta: z.number().nullish(),
  cases: z.array(evalCaseDeltaSchema).optional(),
});

export const simulateResultSchema = z.object({
  run: runSummarySchema,
  traces: z.array(nodeTraceSchema),
});

// Counterfactual replay (STO-609, backend/app/replay.py) request bodies --
// `ReplayRequest` / `ModelOverride` -- are typed from the generated OpenAPI
// contract (SDK 3/7, types.ts); requests aren't runtime-validated, so a
// hand-written Zod copy only duplicated the backend model.
export const replayNodeModeSchema = z.enum(["frozen", "recomputed", "live", "stub_fallback", "forced"]);
export const counterfactualResultSchema = simulateResultSchema.extend({
  original_run_id: z.string(),
  counterfactual: z.boolean(),
  original_traces: z.array(nodeTraceSchema),
  changed_nodes: z.array(z.string()),
  node_modes: z.record(z.string(), replayNodeModeSchema),
});

// P1 rollout plan, Slice D ("Routing policy lab") — POST
// /api/graphs/{id}/routing-lab/run and /routing-lab/compare/{other_id}.
// See backend/app/routing_lab.py and backend/app/models.py's
// RoutingLabReport/RoutingComparison family.
export const routeTargetCountSchema = z.object({
  target_node_id: z.string(),
  count: z.number(),
});

export const routeNodeDistributionSchema = z.object({
  node_id: z.string(),
  total: z.number(),
  targets: z.array(routeTargetCountSchema),
});

export const routingDatasetRunResultSchema = z.object({
  fixture_index: z.number(),
  run_id: z.string(),
  status: z.string(),
  route_decisions: z.array(routeDecisionSchema),
  estimated_usd: z.number(),
  duration_ms: z.number().nullish(),
});

export const routingLabReportSchema = z.object({
  graph_id: z.string(),
  dataset_size: z.number(),
  distributions: z.array(routeNodeDistributionSchema),
  total_estimated_usd: z.number(),
  runs: z.array(routingDatasetRunResultSchema),
});

export const routeTargetCountDeltaSchema = z.object({
  target_node_id: z.string(),
  baseline_count: z.number(),
  candidate_count: z.number(),
});

export const routeNodeDistributionDeltaSchema = z.object({
  node_id: z.string(),
  targets: z.array(routeTargetCountDeltaSchema),
});

export const routingComparisonSchema = z.object({
  baseline: routingLabReportSchema,
  candidate: routingLabReportSchema,
  distribution_deltas: z.array(routeNodeDistributionDeltaSchema),
});

export const providerModelOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const providerModelCatalogSchema = z.object({
  provider: chatProviderSchema,
  models: z.array(providerModelOptionSchema),
  source: z.enum(["live", "fallback"]),
  cached: z.boolean(),
  message: z.string(),
});

export const providerCredentialsSchema = z.object({
  // Wire type is `ChatProvider | string` — a known provider id or a
  // forward-compatible one the SDK doesn't enumerate yet.
  provider: z.string(),
  requires_api_key: z.boolean(),
  label: z.string(),
  env_var: z.string(),
  configured: z.boolean(),
});

/** GET /api/health. `storage_backend` is "supabase", "object_store", "turso" or "sqlite" (local, not shared). */
/** In-app knowledge base article (canvas-workbench-ergonomics-plan.md §11), `GET /api/kb`. */
export const kbArticleSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.enum(["concept", "node", "edge", "panel", "resource"]),
  keywords: z.array(z.string()),
  related: z.array(z.string()),
});

/** A whole article, Markdown body included (`GET /api/kb/{article_id}`). */
export const kbArticleSchema = kbArticleSummarySchema.extend({ body: z.string() });

export const serverHealthSchema = z.object({
  ok: z.boolean(),
  storage_backend: z.string(),
  message: z.string().optional(),
  /** The deployed commit (VERCEL_GIT_COMMIT_SHA / GIT_COMMIT_SHA); null locally, absent from older servers. */
  commit: z.string().nullable().optional(),
});

export const providerReadySchema = z.object({
  ready: z.boolean(),
  message: z.string(),
});

export const deletedSchema = z.object({
  deleted: z.boolean(),
});

/**
 * Stored resources (studio-consolidation Phase 3 — see
 * docs/planning/features/studio-consolidation-plan.md and
 * backend/app/resource_models.py). Field names are plain snake_case,
 * matching this SDK's existing convention (`entry_node_id`, `run_id`, …)
 * rather than micro-ui-agent-builder's camelCase Zod schemas.
 */
export const promptTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  body: z.string(),
});

export const toolDefinitionSchema = z.object({
  id: z.string(),
  description: z.string(),
  parameters_json: z.string(),
  requires_approval: z.boolean(),
  mcp_server_id: z.string().nullish(),
  mcp_tool_name: z.string().nullish(),
});

export const mcpServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  transport: z.enum(["http", "sse", "stdio"]),
  enabled: z.boolean(),
});

/** An MCP server's stored request header names; values are write-only. */
export const mcpHeaderNamesSchema = z.object({ names: z.array(z.string()) });

/** One tool an MCP server lists (`tools/list`). */
export const mcpRemoteToolSchema = z.object({
  name: z.string(),
  description: z.string().nullish(),
  input_schema: z.record(z.string(), z.unknown()),
});

/** `POST /api/mcp-servers/{id}/discover`: the server's tools, or why it couldn't connect. */
export const mcpDiscoverySchema = z.object({
  ok: z.boolean(),
  tools: z.array(mcpRemoteToolSchema),
  error: z.string().nullish(),
});

/** A graph packaged to run as an agent: `POST /api/agents/{id}/runs` applies
 * its LLM profile (default provider/model), prepends its instructions to
 * model nodes' system prompts, and enforces its tool allow-list (empty =
 * any). The API migrates agents stored in the older shape on read. */
export const agentProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  graph_id: z.string(),
  llm_profile_id: z.string().nullish(),
  system_prompt_id: z.string().nullish(),
  system_instructions: z.string().nullish(),
  tool_ids: z.array(z.string()),
});

/** `POST /api/transforms/preview`: the output, or the error a run would fail with. */
export const transformPreviewResponseSchema = z.object({
  ok: z.boolean(),
  output: z.unknown(),
  error: z.string().nullish(),
});

/** A Transforms library entry (`/api/transforms`). */
export const transformDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  type: transformTypeSchema,
  pointer: z.string().nullish(),
  field: z.string().nullish(),
  template: z.string().nullish(),
  target_type: transformTargetTypeSchema.nullish(),
});

export const llmProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string(),
  model_provider: z.string().nullish(),
  description: z.string().nullish(),
});

/** One node that references a registry resource (Wave 4a "used by",
 * `GET /api/{path}/{id}/usages`). `via` marks indirect use: an MCP server
 * reached through a bound tool (`"tools:<id>"`). */
export const resourceUsageSchema = z.object({
  graph_id: z.string(),
  graph_name: z.string(),
  node_id: z.string(),
  node_type: z.string(),
  field: z.string(),
  via: z.string().nullish(),
});

/**
 * P1 rollout plan, parallel track ("Versioned reusable entity registry" —
 * see docs/planning/features/p1-rollout-plan.md and
 * backend/app/resource_versions.py). An immutable snapshot of a stored
 * resource's payload at publish time, for prompts/tools/mcp_servers/
 * agents/llm_profiles only — chat_sessions (a runtime scratchpad) is
 * excluded.
 */
export const resourceVersionSchema = z.object({
  version_id: z.string(),
  kind: z.string(),
  resource_id: z.string(),
  payload: z.record(z.string(), z.unknown()),
  fingerprint: z.string(),
  created_at: z.string(),
});

export const publishResourceVersionResponseSchema = z.object({
  version: resourceVersionSchema,
  created: z.boolean(),
});

// GET /api/{path}/{resource_id}/versions's compact per-entry shape
// (storage.py's get_resource_version_index) — not the full ResourceVersion
// payload, same convention as releaseIndexEntrySchema.
export const resourceVersionIndexEntrySchema = z.object({
  version_id: z.string(),
  fingerprint: z.string(),
  created_at: z.string(),
});

/**
 * A direct model scratchpad (studio-consolidation Phase 8) — bypasses the
 * graph engine entirely, chatting straight to a chosen provider/model. Not
 * a Run: no compile step, no relation to any graph_id.
 */
/** A graph run started from Chat (STO-600): the message keeps a reference;
 * live status comes from the run endpoints. */
export const chatRunRefSchema = z.object({
  run_id: z.string(),
  graph_id: z.string(),
  graph_name: z.string(),
  source: z.enum(["draft", "release"]),
  release_id: z.string().nullish(),
  input: z.record(z.string(), z.unknown()),
  /** Set when started as an agent (`/run @agent`). */
  agent_id: z.string().nullish(),
  agent_name: z.string().nullish(),
});

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  created_at: z.string(),
  run: chatRunRefSchema.nullish(),
});

export const chatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string(),
  model: z.string(),
  messages: z.array(chatMessageSchema),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * Run analytics / spend estimation (studio-consolidation Phase 5 — see
 * docs/planning/features/studio-consolidation-plan.md and backend's
 * analytics.py). `estimated_usd`/token counts are rough estimates, not
 * billing truth — see analytics.py's module docstring.
 */
export const analyticsDailyPointSchema = z.object({
  date: z.string(),
  invocations: z.number(),
  tokens: z.number(),
  estimated_usd: z.number(),
  /** Runs by status that day ("succeeded", "failed", "paused", ...); absent from older servers. */
  by_status: z.record(z.string(), z.number()).optional(),
});

export const analyticsGraphRowSchema = z.object({
  graph_id: z.string(),
  name: z.string(),
  invocations: z.number(),
  tokens: z.number(),
  estimated_usd: z.number(),
});

export const analyticsTotalsSchema = z.object({
  invocations: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  estimated_usd: z.number(),
  avg_duration_ms: z.number(),
});

/** Runs whose duration falls in [min_ms, max_ms); `max_ms` null = no upper bound. */
export const analyticsLatencyBucketSchema = z.object({
  label: z.string(),
  min_ms: z.number(),
  max_ms: z.number().nullable(),
  runs: z.number(),
});

/** A provider/model's llm and tool_loop calls across the window. */
export const analyticsModelRowSchema = z.object({
  provider: z.string(),
  model: z.string(),
  runs: z.number(),
  calls: z.number(),
  tokens: z.number(),
  estimated_usd: z.number(),
});

export const analyticsDashboardPayloadSchema = z.object({
  totals: analyticsTotalsSchema,
  daily: z.array(analyticsDailyPointSchema),
  by_graph: z.array(analyticsGraphRowSchema),
  /** The status/latency/model breakdowns are absent from older servers. */
  by_status: z.record(z.string(), z.number()).optional(),
  /** Fixed duration buckets; empty when no run in the window has a duration. */
  latency: z.array(analyticsLatencyBucketSchema).optional(),
  by_model: z.array(analyticsModelRowSchema).optional(),
});

// Graph/node-scoped analytics (studio-graph-workbench-redesign-plan.md,
// Wave 2 -- backend/app/node_analytics.py).
export const nodeMetricsSchema = z.object({
  node_id: z.string(),
  node_type: z.string(),
  executions: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  success_rate: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  p95_duration_ms: z.number().nullable(),
  last_run_id: z.string().nullable(),
  last_run_at: z.string().nullable(),
  last_error: z.string().nullable(),
});

export const graphAnalyticsSchema = z.object({
  graph_id: z.string(),
  run_window: z.number(),
  totals: analyticsTotalsSchema,
  succeeded_runs: z.number(),
  failed_runs: z.number(),
  success_rate: z.number().nullable(),
  p95_duration_ms: z.number().nullable(),
  nodes: z.array(nodeMetricsSchema),
});

export const nodeExecutionSchema = z.object({
  run_id: z.string(),
  run_status: z.string(),
  status: z.string(),
  started_at: z.string().nullable(),
  duration_ms: z.number().nullable(),
  error: z.string().nullable(),
});

/**
 * P2, "Cross-cutting policy overlays" (see
 * docs/planning/roadmap.md's Strategic Roadmap Addendum and
 * backend/app/policies.py). A time-boxed waiver for a specific policy
 * diagnostic on a specific graph — optionally scoped to one node.
 */
export const policyExceptionSchema = z.object({
  id: z.string(),
  graph_id: z.string(),
  policy_code: z.string(),
  node_id: z.string().nullish(),
  reason: z.string().nullish(),
  created_at: z.string(),
  expires_at: z.string(),
});

export const createPolicyExceptionRequestSchema = z.object({
  policy_code: z.string(),
  node_id: z.string().nullish(),
  reason: z.string().nullish(),
  expires_at: z.string(),
});

/**
 * Configurable policies (STO-608, backend/app/policies.py): the rule
 * catalog, a scope's settings (workspace defaults or one graph's
 * overrides), and each rule's effective value after default → workspace →
 * graph resolution.
 */
export const policyEnforcementSchema = z.enum(["off", "warn", "block_publish", "block"]);
export const policyParamValueSchema = z.union([z.number(), z.string(), z.boolean()]);
const policySourceSchema = z.enum(["default", "workspace", "graph"]);

export const policyParamSpecSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["integer", "choice"]),
  default: policyParamValueSchema,
  description: z.string().nullish(),
  minimum: z.number().nullish(),
  choices: z.array(z.string()).nullish(),
});

export const policyRuleInfoSchema = z.object({
  code: z.string(),
  category: z.enum(["security", "reliability", "cost", "governance"]),
  title: z.string(),
  description: z.string(),
  gate: z.enum(["compile", "publish"]),
  default_enforcement: policyEnforcementSchema,
  params: z.array(policyParamSpecSchema),
});

export const policyRuleSettingSchema = z.object({
  enforcement: policyEnforcementSchema.nullish(),
  params: z.record(z.string(), policyParamValueSchema),
});

export const policySettingsSchema = z.object({
  rules: z.record(z.string(), policyRuleSettingSchema),
  updated_at: z.string().nullish(),
});

export const effectivePolicyRuleSchema = z.object({
  rule: policyRuleInfoSchema,
  enforcement: policyEnforcementSchema,
  enforcement_source: policySourceSchema,
  params: z.record(z.string(), policyParamValueSchema),
  param_sources: z.record(z.string(), policySourceSchema),
});

/**
 * P2, "Retrieval/document lineage graph" (see
 * docs/planning/roadmap.md's Strategic Roadmap Addendum and
 * backend/app/knowledge.py). One durable record of a knowledge chunk
 * actually retrieved and used to augment an `llm` node's system prompt
 * during a run — "which runs/nodes used this document."
 */
export const knowledgeLineageEntrySchema = z.object({
  id: z.string(),
  graph_id: z.string(),
  document_id: z.string(),
  document_name: z.string(),
  chunk_id: z.string(),
  run_id: z.string(),
  node_id: z.string(),
  score: z.number(),
  created_at: z.string(),
  // Richer lineage (2026-10); older rows omit them.
  document_version: z.number().nullish(),
  rank: z.number().nullish(),
  query: z.string().nullish(),
  embedding_model: z.string().nullish(),
  release_id: z.string().nullish(),
});

/** `GET /api/graphs/{id}/knowledge/lineage-graph`: documents → chunks → runs → nodes. */
export const lineageGraphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["document", "chunk", "run", "node"]),
  label: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export const lineageGraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  kind: z.enum(["contains", "retrieved", "used_in"]),
  score: z.number().nullish(),
});
export const lineageGraphSchema = z.object({
  nodes: z.array(lineageGraphNodeSchema),
  edges: z.array(lineageGraphEdgeSchema),
  truncated: z.boolean().optional(),
});

/**
 * Studio-consolidation Phase 5 knowledge base (backend/app/knowledge.py):
 * one uploaded .txt/.md document. Field names are the backend's own
 * `KnowledgeDocument.model_dump()` (snake_case), unlike the camelCase
 * envelope `summarize_entry` wraps them in.
 */
export const knowledgeDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime_type: z.string(),
  uploaded_at: z.string(),
  char_count: z.number(),
  content_hash: z.string().nullish(),
  version: z.number().optional(),
});

// `summarize_entry`'s camelCase shape. The embedding fields are null when
// the graph has no knowledge base yet (or its last document was deleted).
const knowledgeSummaryFields = {
  documents: z.array(knowledgeDocumentSchema),
  chunkCount: z.number(),
  embeddingProvider: z.string().nullable(),
  embeddingModelId: z.string().nullable(),
  // Vector size of the indexed chunks (e.g. 384 for Supabase gte-small).
  embeddingDimensions: z.number().nullish(),
  // What uploads/retrieval use right now: the indexed provider while it's
  // still configured, else the default for a first upload; null when none
  // is. Nullish so the client still accepts backends older than these fields.
  activeEmbeddingProvider: z.string().nullish(),
  activeEmbeddingModelId: z.string().nullish(),
  // Why the active fields are null: "public_demo_mode" or "not_configured".
  embeddingUnavailableReason: z.string().nullish(),
};

// GET /api/graphs/{id}/knowledge
export const knowledgeSummarySchema = z.object({
  graphId: z.string(),
  ...knowledgeSummaryFields,
});

// POST /api/graphs/{id}/knowledge (multipart upload)
export const knowledgeUploadResponseSchema = z.object({
  ok: z.boolean(),
  documentId: z.string(),
  addedChunkCount: z.number(),
  ...knowledgeSummaryFields,
});

// DELETE /api/graphs/{id}/knowledge/{document_id}
export const knowledgeDeleteResponseSchema = z.object({
  ok: z.boolean(),
  ...knowledgeSummaryFields,
});

/**
 * Large-graph complexity, Wave 7a (STO-610): the graph health score
 * (backend/app/graph_health.py) and a node's blast radius
 * (backend/app/impact.py). Both are computed against a draft graph.
 */
export const healthItemSchema = z.object({
  node_id: z.string().nullish(),
  edge_id: z.string().nullish(),
  message: z.string(),
});
export const healthFactorSchema = z.object({
  id: z.string(),
  label: z.string(),
  deduction: z.number(),
  max: z.number(),
  items: z.array(healthItemSchema),
  note: z.string().nullish(),
});
export const graphHealthSchema = z.object({
  graph_id: z.string(),
  score: z.number(),
  band: z.enum(["healthy", "attention", "at_risk"]),
  factors: z.array(healthFactorSchema),
  computed_at: z.string(),
});
export const nodeImpactSchema = z.object({
  node_id: z.string(),
  downstream: z.array(z.string()),
  outputs_reached: z.array(z.string()),
  routers_downstream: z.array(z.string()),
  upstream_count: z.number(),
  bindings: z.array(z.object({ field: z.string(), kind: z.string(), resource_id: z.string() })),
  runs: z.object({ executions: z.number(), last_run_id: z.string().nullish(), last_run_at: z.string().nullish() }),
  releases: z.array(z.object({ release_id: z.string(), created_at: z.string(), changed_since: z.boolean() })),
  datasets: z.array(z.object({ dataset_id: z.string(), name: z.string() })),
  // Wave 7c: the graph a subgraph node runs.
  uses_graph: z.object({ graph_id: z.string(), name: z.string().nullish(), version: z.string() }).nullish(),
});

/** Wave 7c (STO-612): POST /api/graphs/{id}/extract-subgraph. */
export const subgraphExtractResponseSchema = z.object({
  child_graph: graphDefinitionSchema,
  proposed_parent: graphDefinitionSchema,
});

/** GET /api/graph-summaries -- a saved graph without its nodes/edges, for
 * lists and pickers. One catalog read on the server, not one per graph. */
export const graphSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  updated_at: z.string().nullish(),
  node_count: z.number().int(),
  edge_count: z.number().int(),
  input_variables: z.array(z.string()),
  subgraph_ids: z.array(z.string()),
});

/** Wave 7c: GET /api/graphs/{id}/used-by -- parents referencing this graph. */
/** `GET /api/graphs/{id}/resources`: library resources the graph uses, by API kind. */
export const graphResourcesSchema = z.object({
  graph_id: z.string(),
  ids: z.record(z.string(), z.array(z.string())),
});

export const graphUsedBySchema = z.array(
  z.object({ graph_id: z.string(), name: z.string(), node_ids: z.array(z.string()) }),
);
