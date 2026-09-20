import type { z } from "zod";

import type {
  agentProfileSchema,
  analyticsDailyPointSchema,
  analyticsDashboardPayloadSchema,
  analyticsGraphRowSchema,
  analyticsTotalsSchema,
  capabilityEntrySchema,
  capabilityMatrixSchema,
  chatMessageSchema,
  chatProviderSchema,
  chatSessionSchema,
  compileResultSchema,
  dataClassificationSchema,
  diagnosticSchema,
  edgeKindSchema,
  edgeTransformSchema,
  graphDefinitionSchema,
  graphEdgeSchema,
  graphNodeSchema,
  graphOrientationSchema,
  graphPortSchema,
  graphReleaseSchema,
  llmProfileSchema,
  mcpServerConfigSchema,
  nodePositionSchema,
  nodeTraceSchema,
  nodeTypeSchema,
  platformEventSchema,
  portContractSchema,
  portKindSchema,
  promptTemplateSchema,
  providerCredentialsSchema,
  providerModelCatalogSchema,
  providerModelOptionSchema,
  publishReleaseResponseSchema,
  releaseIndexEntrySchema,
  routeDecisionSchema,
  runSummarySchema,
  toolDefinitionSchema,
} from "./schemas.js";

// Every type below is inferred from a Zod schema in ./schemas.ts — that file
// is the single source of truth (studio-consolidation Phase 4f). Keeping the
// type names here (rather than importing the schemas directly everywhere)
// avoids a repo-wide rename across apps/studio and apps/playground.

export type ChatProvider = z.infer<typeof chatProviderSchema>;

/**
 * The six original POC node types plus six absorbed from
 * micro-ui-agent-builder's FlowStep vocabulary (studio-consolidation
 * program — see docs/planning/features/studio-consolidation-plan.md).
 * All twelve have runtime executors as of Phase 2 (backend/app/nodes.py).
 */
export type NodeType = z.infer<typeof nodeTypeSchema>;
export type EdgeKind = z.infer<typeof edgeKindSchema>;
export type GraphOrientation = z.infer<typeof graphOrientationSchema>;

/**
 * P0 graph foundation, Slice A (docs/planning/features/p0-graph-foundation-design-plan.md).
 * Optional on GraphNode/GraphEdge; nothing yet resolves or enforces these
 * at runtime.
 */
export type PortKind = z.infer<typeof portKindSchema>;
export type DataClassification = z.infer<typeof dataClassificationSchema>;
export type PortContract = z.infer<typeof portContractSchema>;
export type GraphPort = z.infer<typeof graphPortSchema>;
export type EdgeTransform = z.infer<typeof edgeTransformSchema>;

export type NodePosition = z.infer<typeof nodePositionSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphDefinition = z.infer<typeof graphDefinitionSchema>;
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type CompileResult = z.infer<typeof compileResultSchema>;
export type RouteDecision = z.infer<typeof routeDecisionSchema>;

/**
 * P0 graph foundation, Slice C (docs/planning/features/p0-graph-foundation-design-plan.md,
 * "Releases and fingerprinting" / "LangGraph adapter boundary").
 */
export type GraphRelease = z.infer<typeof graphReleaseSchema>;
export type PublishReleaseResponse = z.infer<typeof publishReleaseResponseSchema>;
export type ReleaseIndexEntry = z.infer<typeof releaseIndexEntrySchema>;
export type CapabilityEntry = z.infer<typeof capabilityEntrySchema>;
export type CapabilityMatrix = z.infer<typeof capabilityMatrixSchema>;

// "paused" was added for the `human_gate` node type (studio-consolidation
// Phase 2): a run stopped at a human-approval checkpoint, resumable via
// `AgentGraphClient.resumeRun` (POST /api/runs/{id}/resume).
export type RunSummary = z.infer<typeof runSummarySchema>;
export type NodeTrace = z.infer<typeof nodeTraceSchema>;
export type PlatformEvent = z.infer<typeof platformEventSchema>;

export type ProviderModelOption = z.infer<typeof providerModelOptionSchema>;
export type ProviderModelCatalog = z.infer<typeof providerModelCatalogSchema>;
export type ProviderCredentials = z.infer<typeof providerCredentialsSchema>;

/**
 * Stored resources (studio-consolidation Phase 3 — see
 * docs/planning/features/studio-consolidation-plan.md and
 * backend/app/resource_models.py). Field names are plain snake_case,
 * matching this SDK's existing convention (`entry_node_id`, `run_id`, …)
 * rather than micro-ui-agent-builder's camelCase Zod schemas.
 */
export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type LlmProfile = z.infer<typeof llmProfileSchema>;

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatSession = z.infer<typeof chatSessionSchema>;

/**
 * Run analytics / spend estimation (studio-consolidation Phase 5 — see
 * docs/planning/features/studio-consolidation-plan.md and
 * backend/app/analytics.py). `estimated_usd`/token counts are rough
 * estimates, not billing truth.
 */
export type AnalyticsDailyPoint = z.infer<typeof analyticsDailyPointSchema>;
export type AnalyticsGraphRow = z.infer<typeof analyticsGraphRowSchema>;
export type AnalyticsTotals = z.infer<typeof analyticsTotalsSchema>;
export type AnalyticsDashboardPayload = z.infer<typeof analyticsDashboardPayloadSchema>;
