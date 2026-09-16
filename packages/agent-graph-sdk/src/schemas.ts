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

export const graphNodeSchema = z.object({
  id: z.string(),
  type: nodeTypeSchema,
  position: nodePositionSchema,
  config: z.record(z.string(), z.unknown()),
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: edgeKindSchema,
  condition: z.string().nullish(),
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
