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
