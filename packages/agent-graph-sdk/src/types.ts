import type { components } from "./generated/openapi.js";
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
  chatRunRefSchema,
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
  resourceUsageSchema,
  mcpServerConfigSchema,
  nodeExecutionSchema,
  nodeMetricsSchema,
  nodePositionSchema,
  nodeTraceSchema,
  nodeTypeSchema,
  platformEventSchema,
  effectivePolicyRuleSchema,
  graphGroupSchema,
  graphLayerSchema,
  graphHealthSchema,
  healthFactorSchema,
  nodeImpactSchema,
  subgraphExtractResponseSchema,
  graphSummarySchema,
  graphUsedBySchema,
  policyEnforcementSchema,
  policyExceptionSchema,
  policyParamSpecSchema,
  policyParamValueSchema,
  policyRuleInfoSchema,
  policyRuleSettingSchema,
  policySettingsSchema,
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
  counterfactualResultSchema,
  replayNodeModeSchema,
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
// Counterfactual replay (STO-609).
// SDK 3/7 (STO-616): request bodies come straight from the OpenAPI contract.
/** Counterfactual replay: pin routers and/or swap an LLM node's provider/model. */
export type ReplayRequest = components["schemas"]["ReplayRequest"];
export type ModelOverride = components["schemas"]["ModelOverride"];
export type ReplayNodeMode = z.infer<typeof replayNodeModeSchema>;
export type CounterfactualResult = z.infer<typeof counterfactualResultSchema>;

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
export type ResourceUsage = z.infer<typeof resourceUsageSchema>;

// P1 rollout plan, parallel track ("Versioned reusable entity registry").
export type ResourceVersion = z.infer<typeof resourceVersionSchema>;
export type PublishResourceVersionResponse = z.infer<typeof publishResourceVersionResponseSchema>;
export type ResourceVersionIndexEntry = z.infer<typeof resourceVersionIndexEntrySchema>;

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRunRef = z.infer<typeof chatRunRefSchema>;
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
// Configurable policies (STO-608).
export type PolicyEnforcement = z.infer<typeof policyEnforcementSchema>;
export type PolicyParamValue = z.infer<typeof policyParamValueSchema>;
export type PolicyParamSpec = z.infer<typeof policyParamSpecSchema>;
export type PolicyRuleInfo = z.infer<typeof policyRuleInfoSchema>;
export type PolicyRuleSetting = z.infer<typeof policyRuleSettingSchema>;
export type PolicySettings = z.infer<typeof policySettingsSchema>;
export type EffectivePolicyRule = z.infer<typeof effectivePolicyRuleSchema>;

// P2, "Retrieval/document lineage graph" (backend/app/knowledge.py).
export type KnowledgeLineageEntry = z.infer<typeof knowledgeLineageEntrySchema>;

// Studio-consolidation Phase 5 knowledge base (backend/app/knowledge.py).
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export type KnowledgeSummary = z.infer<typeof knowledgeSummarySchema>;
export type KnowledgeUploadResponse = z.infer<typeof knowledgeUploadResponseSchema>;
export type KnowledgeDeleteResponse = z.infer<typeof knowledgeDeleteResponseSchema>;

// Large-graph complexity, Wave 7a (STO-610).
export type GraphHealth = z.infer<typeof graphHealthSchema>;
export type HealthFactor = z.infer<typeof healthFactorSchema>;
export type NodeImpact = z.infer<typeof nodeImpactSchema>;
export type SubgraphExtractResponse = z.infer<typeof subgraphExtractResponseSchema>;
export type GraphSummary = z.infer<typeof graphSummarySchema>;
export type GraphUsedBy = z.infer<typeof graphUsedBySchema>;
export type GraphGroup = z.infer<typeof graphGroupSchema>;
export type GraphLayer = z.infer<typeof graphLayerSchema>;
