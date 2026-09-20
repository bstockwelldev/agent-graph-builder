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

export const portContractSchema = z.object({
  kind: portKindSchema,
  schema: z.record(z.string(), z.unknown()).optional(),
  required: z.boolean().optional(),
  classification: dataClassificationSchema.optional(),
});

export const graphPortSchema = z.object({
  id: z.string(),
  name: z.string(),
  direction: z.enum(["input", "output"]),
  contract: portContractSchema,
});

// Schema-only in Slice A — per-type fields (pointer/field/template/
// target_type) are added as Slice B needs them for transform application.
export const edgeTransformSchema = z.object({
  type: z.enum(["select", "wrap", "format_message", "coerce"]),
  pointer: z.string().optional(),
  field: z.string().optional(),
  template: z.string().optional(),
  target_type: z.enum(["string", "number", "boolean"]).optional(),
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

export const graphDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  entry_node_id: z.string(),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  orientation: graphOrientationSchema.optional(),
  updated_at: z.string().nullish(),
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
  to_release_id: z.string(),
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
export const fixtureSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  node_outputs: z.record(z.string(), z.unknown()),
});

export const simulateResultSchema = z.object({
  run: runSummarySchema,
  traces: z.array(nodeTraceSchema),
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

export const agentProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  default_flow_id: z.string().nullish(),
  system_instructions: z.string().nullish(),
  optional_elements: z.array(z.string()),
});

export const llmProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string(),
  model_provider: z.string().nullish(),
  description: z.string().nullish(),
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
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  created_at: z.string(),
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

export const analyticsDashboardPayloadSchema = z.object({
  totals: analyticsTotalsSchema,
  daily: z.array(analyticsDailyPointSchema),
  by_graph: z.array(analyticsGraphRowSchema),
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
