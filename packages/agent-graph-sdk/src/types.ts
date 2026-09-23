import type { z } from "zod";

import type {
  agentProfileSchema,
  analyticsDailyPointSchema,
  analyticsDashboardPayloadSchema,
  analyticsGraphRowSchema,
  analyticsTotalsSchema,
  capabilityEntrySchema,
  capabilityMatrixSchema,
  chatContextSchema,
  chatMessageSchema,
  chatProviderSchema,
  chatSessionSchema,
  compileResultSchema,
  dataClassificationSchema,
  diagnosticSchema,
  edgeKindSchema,
  edgeTransformSchema,
  fixtureDatasetSchema,
  fixtureSchema,
  graphAnalyticsSchema,
  graphDefinitionSchema,
  graphEdgeSchema,
  graphNodeSchema,
  graphElementChangeSchema,
  graphOrientationSchema,
  graphPortSchema,
  graphReleaseSchema,
  knowledgeDeleteResponseSchema,
  knowledgeDocumentSchema,
  knowledgeLineageEntrySchema,
  knowledgeSummarySchema,
  knowledgeUploadResponseSchema,
  llmProfileSchema,
  mcpServerConfigSchema,
  nodeExecutionSchema,
  nodeMetricsSchema,
  nodePositionSchema,
  nodeTraceSchema,
  nodeTypeSchema,
  platformEventSchema,
  policyExceptionSchema,
  portContractSchema,
  portKindSchema,
  promptTemplateSchema,
  providerCredentialsSchema,
  providerModelCatalogSchema,
  providerModelOptionSchema,
  publishReleaseResponseSchema,
  publishResourceVersionResponseSchema,
  releaseDiffSchema,
  releaseIndexEntrySchema,
  resourceVersionIndexEntrySchema,
  resourceVersionSchema,
  routeDecisionSchema,
  routeNodeDistributionDeltaSchema,
  routeNodeDistributionSchema,
  routeTargetCountDeltaSchema,
  routeTargetCountSchema,
  routingComparisonSchema,
  routingDatasetRunResultSchema,
  routingLabReportSchema,
  runGraphSnapshotSchema,
  runSummarySchema,
  simulateResultSchema,
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

// P1 rollout plan, Slice A ("Semantic release comparison").
export type GraphElementChange = z.infer<typeof graphElementChangeSchema>;
export type ReleaseDiff = z.infer<typeof releaseDiffSchema>;

// P1 rollout plan, Slice B ("Fixture-based simulation and subgraph stubbing").
export type Fixture = z.infer<typeof fixtureSchema>;
export type FixtureDataset = z.infer<typeof fixtureDatasetSchema>;
export type SimulateResult = z.infer<typeof simulateResultSchema>;

// P1 rollout plan, Slice D ("Routing policy lab").
export type RouteTargetCount = z.infer<typeof routeTargetCountSchema>;
export type RouteNodeDistribution = z.infer<typeof routeNodeDistributionSchema>;
export type RoutingDatasetRunResult = z.infer<typeof routingDatasetRunResultSchema>;
export type RoutingLabReport = z.infer<typeof routingLabReportSchema>;
export type RouteTargetCountDelta = z.infer<typeof routeTargetCountDeltaSchema>;
export type RouteNodeDistributionDelta = z.infer<typeof routeNodeDistributionDeltaSchema>;
export type RoutingComparison = z.infer<typeof routingComparisonSchema>;

// "paused" was added for the `human_gate` node type (studio-consolidation
// Phase 2): a run stopped at a human-approval checkpoint, resumable via
// `AgentGraphClient.resumeRun` (POST /api/runs/{id}/resume).
export type RunSummary = z.infer<typeof runSummarySchema>;
export type NodeTrace = z.infer<typeof nodeTraceSchema>;
export type PlatformEvent = z.infer<typeof platformEventSchema>;

/**
 * P0 graph foundation, Slice D (docs/planning/features/p0-graph-foundation-design-plan.md,
 * "Persistence and API" — GET /api/runs/{run_id}/snapshot).
 */
export type RunGraphSnapshot = z.infer<typeof runGraphSnapshotSchema>;

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

// P1 rollout plan, parallel track ("Versioned reusable entity registry").
export type ResourceVersion = z.infer<typeof resourceVersionSchema>;
export type PublishResourceVersionResponse = z.infer<typeof publishResourceVersionResponseSchema>;
export type ResourceVersionIndexEntry = z.infer<typeof resourceVersionIndexEntrySchema>;

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatSession = z.infer<typeof chatSessionSchema>;
export type ChatContext = z.infer<typeof chatContextSchema>;

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
// Graph/node-scoped analytics (Wave 2, backend/app/node_analytics.py).
export type NodeMetrics = z.infer<typeof nodeMetricsSchema>;
export type GraphAnalytics = z.infer<typeof graphAnalyticsSchema>;
export type NodeExecution = z.infer<typeof nodeExecutionSchema>;

// P2, "Cross-cutting policy overlays" (backend/app/policies.py).
export type PolicyException = z.infer<typeof policyExceptionSchema>;

// P2, "Retrieval/document lineage graph" (backend/app/knowledge.py).
export type KnowledgeLineageEntry = z.infer<typeof knowledgeLineageEntrySchema>;

// Studio-consolidation Phase 5 knowledge base (backend/app/knowledge.py).
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export type KnowledgeSummary = z.infer<typeof knowledgeSummarySchema>;
export type KnowledgeUploadResponse = z.infer<typeof knowledgeUploadResponseSchema>;
export type KnowledgeDeleteResponse = z.infer<typeof knowledgeDeleteResponseSchema>;
