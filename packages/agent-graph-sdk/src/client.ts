import type { z } from "zod";

import { createTransport, type RequestOptions, type Transport, type TransportOptions } from "./transport.js";
import { streamRun, waitForRun, type RunStreamOptions, type WaitForRunOptions } from "./runs.js";
import { CONTRACT_API_VERSION } from "./generated/openapi.js";

import {
  agentProfileSchema,
  analyticsDashboardPayloadSchema,
  capabilityMatrixSchema,
  chatSessionSchema,
  compileResultSchema,
  deletedSchema,
  fixtureDatasetSchema,
  graphDefinitionSchema,
  graphReleaseSchema,
  knowledgeDeleteResponseSchema,
  knowledgeLineageEntrySchema,
  knowledgeSummarySchema,
  knowledgeUploadResponseSchema,
  llmProfileSchema,
  mcpServerConfigSchema,
  nodeTraceSchema,
  effectivePolicyRuleSchema,
  graphHealthSchema,
  nodeImpactSchema,
  subgraphExtractResponseSchema,
  graphUsedBySchema,
  policyExceptionSchema,
  policyRuleInfoSchema,
  policySettingsSchema,
  promptTemplateSchema,
  providerCredentialsSchema,
  providerModelCatalogSchema,
  providerReadySchema,
  publishReleaseResponseSchema,
  publishResourceVersionResponseSchema,
  releaseDiffSchema,
  releaseIndexEntrySchema,
  resourceUsageSchema,
  resourceVersionIndexEntrySchema,
  resourceVersionSchema,
  routingComparisonSchema,
  routingLabReportSchema,
  runGraphSnapshotSchema,
  runSummarySchema,
  graphAnalyticsSchema,
  nodeExecutionSchema,
  simulateResultSchema,
  counterfactualResultSchema,
  toolDefinitionSchema,
} from "./schemas.js";
import type {
  AgentProfile,
  AnalyticsDashboardPayload,
  GraphAnalytics,
  NodeExecution,
  CapabilityMatrix,
  ChatContext,
  ChatProvider,
  ChatSession,
  CompileResult,
  Fixture,
  FixtureDataset,
  GraphDefinition,
  GraphRelease,
  KnowledgeDeleteResponse,
  KnowledgeLineageEntry,
  KnowledgeSummary,
  KnowledgeUploadResponse,
  LlmProfile,
  McpServerConfig,
  NodeTrace,
  PlatformEvent,
  EffectivePolicyRule,
  GraphHealth,
  NodeImpact,
  SubgraphExtractResponse,
  GraphUsedBy,
  PolicyException,
  PolicyRuleInfo,
  PolicySettings,
  ProviderCredentials,
  ProviderModelCatalog,
  PromptTemplate,
  PublishReleaseResponse,
  PublishResourceVersionResponse,
  ReleaseDiff,
  ReleaseIndexEntry,
  ResourceUsage,
  ResourceVersion,
  ResourceVersionIndexEntry,
  RoutingComparison,
  RoutingLabReport,
  RunGraphSnapshot,
  RunSummary,
  SimulateResult,
  CounterfactualResult,
  ReplayRequest,
  ToolDefinition,
} from "./types.js";

/** SDK 1/7: transport options (injectable fetch, headers/auth, timeout,
 * retries, hooks) -- see transport.ts. SDK 3/7 adds `onVersionSkew`: called
 * (once per client) when the server's API version is ahead of the contract
 * this SDK was generated from; defaults to a console warning. Pass `false`
 * to silence it. */
export type AgentGraphClientOptions = TransportOptions & {
  onVersionSkew?: ((skew: VersionSkew) => void) | false;
};

export type VersionSkew = { serverVersion: string; clientVersion: string };

/** True when `server` is ahead of `client` by major or minor (x.y.z). */
export function isServerAhead(server: string, client: string): boolean {
  const parse = (version: string) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [sMajor, sMinor] = parse(server);
  const [cMajor, cMinor] = parse(client);
  return sMajor > cMajor || (sMajor === cMajor && sMinor > cMinor);
}

/**
 * Every client method's single HTTP entry point, now a thin shim over the
 * client's `Transport` (SDK 1/7): headers merge instead of replacing
 * Content-Type, failures reject with typed errors (errors.ts), idempotent
 * requests retry. `schema` is optional, but every method below passes one,
 * so every response this SDK returns is runtime-validated.
 */
function jsonFetch<T>(transport: Transport, path: string, init?: Parameters<Transport["request"]>[1], schema?: z.ZodType<T>): Promise<T> {
  return transport.request<T>(path, init, schema);
}

/**
 * Generic CRUD for one of the five stored resource kinds
 * (studio-consolidation Phase 3 — see backend/app/main.py's
 * `_register_resource_routes` and resource_models.py). Each resource type
 * has an `id` field, so create/update both take the full object.
 */
function resourceClient<T extends { id: string }>(baseUrl: Transport, path: string, schema: z.ZodType<T>) {
  return {
    list: () => jsonFetch<T[]>(baseUrl, `/api/${path}`, undefined, schema.array()),
    get: (id: string) => jsonFetch<T>(baseUrl, `/api/${path}/${encodeURIComponent(id)}`, undefined, schema),
    create: (resource: T) =>
      jsonFetch<T>(baseUrl, `/api/${path}`, { method: "POST", body: JSON.stringify(resource) }, schema),
    update: (resource: T) =>
      jsonFetch<T>(
        baseUrl,
        `/api/${path}/${encodeURIComponent(resource.id)}`,
        { method: "PUT", body: JSON.stringify(resource) },
        schema,
      ),
    delete: (id: string) =>
      jsonFetch<{ deleted: boolean }>(baseUrl, `/api/${path}/${encodeURIComponent(id)}`, { method: "DELETE" }, deletedSchema),
    /** Wave 4a "used by": draft graph nodes bound to this resource. */
    usages: (id: string) =>
      jsonFetch<ResourceUsage[]>(baseUrl, `/api/${path}/${encodeURIComponent(id)}/usages`, undefined, resourceUsageSchema.array()),
  };
}

/**
 * P1 rollout plan, parallel track ("Versioned reusable entity registry")
 * — POST/GET /api/{path}/{resource_id}/versions[/{version_id}]. Attached
 * to a resourceClient's return value as `.versions` for prompts, tools,
 * mcp-servers, agents, and llm-profiles — never chat-sessions, which
 * backend/app/resource_versions.py's VERSIONABLE_RESOURCE_KINDS excludes.
 */
function resourceVersionClient(baseUrl: Transport, path: string) {
  return {
    publish: (resourceId: string) =>
      jsonFetch<PublishResourceVersionResponse>(
        baseUrl,
        `/api/${path}/${encodeURIComponent(resourceId)}/versions`,
        { method: "POST" },
        publishResourceVersionResponseSchema,
      ),
    list: (resourceId: string) =>
      jsonFetch<ResourceVersionIndexEntry[]>(
        baseUrl,
        `/api/${path}/${encodeURIComponent(resourceId)}/versions`,
        undefined,
        resourceVersionIndexEntrySchema.array(),
      ),
    get: (resourceId: string, versionId: string) =>
      jsonFetch<ResourceVersion>(
        baseUrl,
        `/api/${path}/${encodeURIComponent(resourceId)}/versions/${encodeURIComponent(versionId)}`,
        undefined,
        resourceVersionSchema,
      ),
  };
}

/** The client's methods over one transport. `baseUrl` is kept as the
 * parameter name so every call site reads as before. */
function buildMethods(baseUrl: Transport) {
  return {
    listGraphs: () => jsonFetch<GraphDefinition[]>(baseUrl, "/api/graphs", undefined, graphDefinitionSchema.array()),
    listRuns: (graphId: string) =>
      jsonFetch<RunSummary[]>(baseUrl, `/api/graphs/${encodeURIComponent(graphId)}/runs`, undefined, runSummarySchema.array()),
    /** Cross-graph run history (studio-consolidation Phase 5) — flagged as
     * a gap in Phase 4c's as-built notes; `listRuns` above stays the
     * per-graph route the Runs screen uses. */
    listAllRuns: () => jsonFetch<RunSummary[]>(baseUrl, "/api/runs", undefined, runSummarySchema.array()),
    getRun: (runId: string) => jsonFetch<RunSummary>(baseUrl, `/api/runs/${encodeURIComponent(runId)}`, undefined, runSummarySchema),
    createGraph: (name: string, template: "blank" | "demo") =>
      jsonFetch<GraphDefinition>(
        baseUrl,
        "/api/graphs",
        { method: "POST", body: JSON.stringify({ name, template }) },
        graphDefinitionSchema,
      ),
    getGraph: (id: string) =>
      jsonFetch<GraphDefinition>(baseUrl, `/api/graphs/${encodeURIComponent(id)}`, undefined, graphDefinitionSchema),
    saveGraph: (graph: GraphDefinition) =>
      jsonFetch<GraphDefinition>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graph.id)}`,
        { method: "PUT", body: JSON.stringify(graph) },
        graphDefinitionSchema,
      ),
    /** Added for studio-consolidation Phase 3 — graphs were previously
     * never deletable through this API. */
    deleteGraph: (id: string) =>
      jsonFetch<{ deleted: boolean }>(baseUrl, `/api/graphs/${encodeURIComponent(id)}`, { method: "DELETE" }, deletedSchema),
    validateGraph: (graph: GraphDefinition, init?: { signal?: AbortSignal }) =>
      jsonFetch<CompileResult>(
        baseUrl,
        "/api/graphs/validate",
        { method: "POST", body: JSON.stringify(graph), signal: init?.signal },
        compileResultSchema,
      ),
    compileGraph: (id: string) =>
      jsonFetch<CompileResult>(baseUrl, `/api/graphs/${encodeURIComponent(id)}/compile`, { method: "POST" }, compileResultSchema),
    startRun: (
      graphId: string,
      input: Record<string, unknown>,
      provider?: ChatProvider,
      model?: string,
      apiKey?: string,
      // Phase 10 Slice C, "Run from selected node" — pre-seeds these node
      // ids' outputs (typically a mocked ancestor set) so the backend
      // skips invoking their real executors. Omitted for an ordinary run.
      nodeOutputs?: Record<string, unknown>,
    ) =>
      jsonFetch<RunSummary>(
        baseUrl,
        "/api/runs",
        {
          method: "POST",
          body: JSON.stringify({
            graph_id: graphId,
            input,
            provider,
            model,
            api_key: apiKey,
            ...(nodeOutputs ? { node_outputs: nodeOutputs } : {}),
          }),
        },
        runSummarySchema,
      ),
    getRunNodeTraces: (runId: string) =>
      jsonFetch<NodeTrace[]>(baseUrl, `/api/runs/${encodeURIComponent(runId)}/nodes`, undefined, nodeTraceSchema.array()),
    /**
     * P0 graph foundation, Slice D — the run's durable RunGraphSnapshot:
     * the exact graph (and, for a draft-sourced run, resolved resource
     * bindings) it started from, independent of any later draft edits.
     * Historical run inspection should open this, not the current
     * (possibly changed) `getGraph`.
     */
    getRunGraphSnapshot: (runId: string) =>
      jsonFetch<RunGraphSnapshot>(
        baseUrl,
        `/api/runs/${encodeURIComponent(runId)}/snapshot`,
        undefined,
        runGraphSnapshotSchema,
      ),
    /**
     * Resolves a `human_gate` checkpoint (studio-consolidation Phase 2).
     * `approve` defaults to true; pass false to fail the run instead of
     * resuming it. 404s when there is nothing paused for this run id.
     */
    resumeRun: (runId: string, approve = true, reason?: string) =>
      jsonFetch<RunSummary>(
        baseUrl,
        `/api/runs/${encodeURIComponent(runId)}/resume`,
        { method: "POST", body: JSON.stringify({ approve, reason }) },
        runSummarySchema,
      ),
    providerReady: (provider: ChatProvider) =>
      jsonFetch<{ ready: boolean; message: string }>(
        baseUrl,
        `/api/providers/${encodeURIComponent(provider)}/ready`,
        undefined,
        providerReadySchema,
      ),
    providerCredentials: (provider: ChatProvider) =>
      jsonFetch<ProviderCredentials>(
        baseUrl,
        `/api/providers/${encodeURIComponent(provider)}/credentials`,
        undefined,
        providerCredentialsSchema,
      ),
    listProviderModels: (provider: ChatProvider, graphId?: string) => {
      const query = graphId ? `?graph_id=${encodeURIComponent(graphId)}` : "";
      return jsonFetch<ProviderModelCatalog>(
        baseUrl,
        `/api/providers/${encodeURIComponent(provider)}/models${query}`,
        undefined,
        providerModelCatalogSchema,
      );
    },
    /** Run analytics / spend estimation (studio-consolidation Phase 5). */
    getAnalytics: () =>
      jsonFetch<AnalyticsDashboardPayload>(
        baseUrl,
        "/api/analytics",
        undefined,
        analyticsDashboardPayloadSchema,
      ),
    /** Graph-scoped analytics with per-node rollups over the graph's most
     * recent `window` runs (Wave 2 -- backend/app/node_analytics.py). */
    getGraphAnalytics: (graphId: string, window?: number) =>
      jsonFetch<GraphAnalytics>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/analytics${window ? `?window=${window}` : ""}`,
        undefined,
        graphAnalyticsSchema,
      ),
    /** One node's most recent executions, newest first (Wave 2). */
    getNodeHistory: (graphId: string, nodeId: string, limit?: number) =>
      jsonFetch<NodeExecution[]>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/history${limit ? `?limit=${limit}` : ""}`,
        undefined,
        nodeExecutionSchema.array(),
      ),
    // Releases (P0 graph foundation, Slice C — see
    // docs/planning/features/p0-graph-foundation-design-plan.md, "Releases
    // and fingerprinting"). Publishing snapshots the current draft as an
    // immutable GraphRelease; editing the draft afterward never changes a
    // published release or a run started from it.
    publishRelease: (graphId: string, releaseNotes?: string, author?: string) =>
      jsonFetch<PublishReleaseResponse>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/releases`,
        {
          method: "POST",
          body: JSON.stringify({ release_notes: releaseNotes, author }),
        },
        publishReleaseResponseSchema,
      ),
    listReleases: (graphId: string) =>
      jsonFetch<ReleaseIndexEntry[]>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/releases`,
        undefined,
        releaseIndexEntrySchema.array(),
      ),
    getRelease: (graphId: string, releaseId: string) =>
      jsonFetch<GraphRelease>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/releases/${encodeURIComponent(releaseId)}`,
        undefined,
        graphReleaseSchema,
      ),
    // release_id-only routes (no graph_id in the path) — the backend
    // resolves the owning graph via storage.get_release_graph_id.
    compileRelease: (releaseId: string) =>
      jsonFetch<CompileResult>(
        baseUrl,
        `/api/graph-releases/${encodeURIComponent(releaseId)}/compile`,
        { method: "POST" },
        compileResultSchema,
      ),
    startReleaseRun: (
      releaseId: string,
      input: Record<string, unknown>,
      provider?: ChatProvider,
      model?: string,
      apiKey?: string,
    ) =>
      jsonFetch<RunSummary>(
        baseUrl,
        `/api/graph-releases/${encodeURIComponent(releaseId)}/runs`,
        { method: "POST", body: JSON.stringify({ input, provider, model, api_key: apiKey }) },
        runSummarySchema,
      ),
    // P1 rollout plan, Slice A ("Semantic release comparison") — a
    // categorized behavior-level diff between two releases (node config,
    // edge/router, port/contract, and resource_snapshots deltas).
    /** Wave 7a (STO-610): 0-100 health score for a draft graph (unsaved edits included). */
    getGraphHealth: (graphId: string, draft: GraphDefinition) =>
      jsonFetch<GraphHealth>(baseUrl, `/api/graphs/${encodeURIComponent(graphId)}/health`, { method: "POST", body: JSON.stringify(draft) }, graphHealthSchema),
    /** Wave 7a (STO-610): what changing `nodeId` reaches, against a draft graph. */
    getNodeImpact: (graphId: string, nodeId: string, draft: GraphDefinition) =>
      jsonFetch<NodeImpact>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/impact`,
        { method: "POST", body: JSON.stringify(draft) },
        nodeImpactSchema,
      ),
    /** Wave 7c (STO-612): move a connected selection into a new saved graph;
     * returns it plus the parent with a subgraph node in its place (unsaved). */
    extractSubgraph: (graphId: string, draft: GraphDefinition, request: { node_ids: string[]; name: string }) =>
      jsonFetch<SubgraphExtractResponse>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/extract-subgraph`,
        { method: "POST", body: JSON.stringify({ draft, ...request }) },
        subgraphExtractResponseSchema,
      ),
    /** Wave 7c: saved graphs whose subgraph nodes reference `graphId`. */
    getGraphUsedBy: (graphId: string) =>
      jsonFetch<GraphUsedBy>(baseUrl, `/api/graphs/${encodeURIComponent(graphId)}/used-by`, undefined, graphUsedBySchema),
    /** STO-609: diff from a release to a draft graph (e.g. the live canvas, unsaved edits included). */
    compareDraftToRelease: (releaseId: string, draft: GraphDefinition) =>
      jsonFetch<ReleaseDiff>(
        baseUrl,
        `/api/graph-releases/${encodeURIComponent(releaseId)}/compare-draft`,
        { method: "POST", body: JSON.stringify(draft) },
        releaseDiffSchema,
      ),
    compareReleases: (releaseId: string, otherReleaseId: string) =>
      jsonFetch<ReleaseDiff>(
        baseUrl,
        `/api/graph-releases/${encodeURIComponent(releaseId)}/compare/${encodeURIComponent(otherReleaseId)}`,
        undefined,
        releaseDiffSchema,
      ),
    // P1 rollout plan, Slice B ("Fixture-based simulation and subgraph
    // stubbing") — runs the draft graph (or a published release) with no
    // live tool/LLM calls: `fixture.node_outputs` stubs specific nodes,
    // and the provider is always forced to "stub" server-side.
    simulateGraph: (graphId: string, fixture: Fixture) =>
      jsonFetch<SimulateResult>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/simulate`,
        { method: "POST", body: JSON.stringify(fixture) },
        simulateResultSchema,
      ),
    simulateRelease: (releaseId: string, fixture: Fixture) =>
      jsonFetch<SimulateResult>(
        baseUrl,
        `/api/graph-releases/${encodeURIComponent(releaseId)}/simulate`,
        { method: "POST", body: JSON.stringify(fixture) },
        simulateResultSchema,
      ),
    // P1 rollout plan, Slice C ("Historical replay") — read-only
    // re-execution of a past run's exact graph, every non-routing node's
    // original output frozen. Same result shape as simulate — the run
    // history UI can render either through one component. Deliberately
    // named `replayRun`, not reusing the unrelated `"replayed"` trace-event
    // flag human_gate resume already uses.
    // With a `request` it's a counterfactual replay (STO-609): forced
    // routes and/or model overrides; see the ReplayRequest type (generated).
    replayRun: (runId: string, request?: ReplayRequest) =>
      jsonFetch<CounterfactualResult>(
        baseUrl,
        `/api/runs/${encodeURIComponent(runId)}/replay`,
        request ? { method: "POST", body: JSON.stringify(request) } : { method: "POST" },
        counterfactualResultSchema,
      ),
    // P1 rollout plan, Slice D ("Routing policy lab") — runs a graph once
    // per fixture in `dataset` (via simulate, so no live tool/LLM call for
    // any node a fixture stubs) and aggregates the resulting route
    // decisions into a per-router/branch-node distribution.
    runRoutingDataset: (graphId: string, dataset: Fixture[]) =>
      jsonFetch<RoutingLabReport>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/routing-lab/run`,
        { method: "POST", body: JSON.stringify({ dataset }) },
        routingLabReportSchema,
      ),
    /** STO-609: the dataset on a release (baseline; `"latest"` allowed) vs the saved draft (candidate). */
    compareRoutingToRelease: (graphId: string, releaseId: string, dataset: Fixture[]) =>
      jsonFetch<RoutingComparison>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/routing-lab/compare-release/${encodeURIComponent(releaseId)}`,
        { method: "POST", body: JSON.stringify({ dataset }) },
        routingComparisonSchema,
      ),
    compareRoutingDatasets: (graphId: string, otherGraphId: string, dataset: Fixture[]) =>
      jsonFetch<RoutingComparison>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/routing-lab/compare/${encodeURIComponent(otherGraphId)}`,
        { method: "POST", body: JSON.stringify({ dataset }) },
        routingComparisonSchema,
      ),
    // P2, "Cross-cutting policy overlays" (backend/app/policies.py) — a
    // time-boxed waiver for a specific policy diagnostic on a graph,
    // optionally scoped to one node. Graph-scoped routes (not release_id-
    // only, unlike releases/compare) since exceptions apply to the draft's
    // compile gate, not a specific immutable release.
    createPolicyException: (
      graphId: string,
      policyCode: string,
      expiresAt: string,
      nodeId?: string,
      reason?: string,
    ) =>
      jsonFetch<PolicyException>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/policy-exceptions`,
        {
          method: "POST",
          body: JSON.stringify({
            policy_code: policyCode,
            node_id: nodeId,
            reason,
            expires_at: expiresAt,
          }),
        },
        policyExceptionSchema,
      ),
    listPolicyExceptions: (graphId: string) =>
      jsonFetch<PolicyException[]>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/policy-exceptions`,
        undefined,
        policyExceptionSchema.array(),
      ),
    /** Extend (or shorten) a waiver's expiry; `reason` is kept when omitted. */
    updatePolicyException: (graphId: string, exceptionId: string, expiresAt: string, reason?: string) =>
      jsonFetch<PolicyException>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/policy-exceptions/${encodeURIComponent(exceptionId)}`,
        { method: "PATCH", body: JSON.stringify({ expires_at: expiresAt, reason }) },
        policyExceptionSchema,
      ),
    /** Every graph's exceptions -- the workspace Policies page. */
    listAllPolicyExceptions: () =>
      jsonFetch<PolicyException[]>(baseUrl, "/api/policy-exceptions", undefined, policyExceptionSchema.array()),
    // Configurable policies (STO-608): catalog, workspace defaults, per-graph
    // overrides, and the effective (resolved) rules.
    getPolicyCatalog: () =>
      jsonFetch<PolicyRuleInfo[]>(baseUrl, "/api/policies/catalog", undefined, policyRuleInfoSchema.array()),
    getWorkspacePolicies: () =>
      jsonFetch<PolicySettings>(baseUrl, "/api/policies/workspace", undefined, policySettingsSchema),
    saveWorkspacePolicies: (settings: Pick<PolicySettings, "rules">) =>
      jsonFetch<PolicySettings>(
        baseUrl,
        "/api/policies/workspace",
        { method: "PUT", body: JSON.stringify({ rules: settings.rules }) },
        policySettingsSchema,
      ),
    getEffectivePolicies: (graphId?: string) =>
      jsonFetch<EffectivePolicyRule[]>(
        baseUrl,
        graphId ? `/api/graphs/${encodeURIComponent(graphId)}/policies/effective` : "/api/policies/effective",
        undefined,
        effectivePolicyRuleSchema.array(),
      ),
    getGraphPolicies: (graphId: string) =>
      jsonFetch<PolicySettings>(baseUrl, `/api/graphs/${encodeURIComponent(graphId)}/policies`, undefined, policySettingsSchema),
    saveGraphPolicies: (graphId: string, settings: Pick<PolicySettings, "rules">) =>
      jsonFetch<PolicySettings>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/policies`,
        { method: "PUT", body: JSON.stringify({ rules: settings.rules }) },
        policySettingsSchema,
      ),
    deletePolicyException: (graphId: string, exceptionId: string) =>
      jsonFetch<{ deleted: boolean }>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/policy-exceptions/${encodeURIComponent(exceptionId)}`,
        { method: "DELETE" },
        deletedSchema,
      ),
    // Knowledge base (studio-consolidation Phase 5, backend/app/knowledge.py):
    // per-graph .txt/.md documents, chunked + embedded on upload. The
    // transport only adds a JSON Content-Type for string bodies, so the
    // runtime sets the multipart boundary for this FormData itself.
    getKnowledge: (graphId: string) =>
      jsonFetch<KnowledgeSummary>(baseUrl, `/api/graphs/${encodeURIComponent(graphId)}/knowledge`, undefined, knowledgeSummarySchema),
    uploadKnowledgeDocument: (graphId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return jsonFetch<KnowledgeUploadResponse>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/knowledge`,
        { method: "POST", body: form },
        knowledgeUploadResponseSchema,
      );
    },
    deleteKnowledgeDocument: (graphId: string, documentId: string) =>
      jsonFetch<KnowledgeDeleteResponse>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/knowledge/${encodeURIComponent(documentId)}`,
        { method: "DELETE" },
        knowledgeDeleteResponseSchema,
      ),
    // P2, "Retrieval/document lineage graph" (backend/app/knowledge.py) —
    // every recorded retrieval for this graph's knowledge base, optionally
    // filtered to one document: "which runs/nodes used this document."
    getKnowledgeLineage: (graphId: string, documentId?: string) => {
      const query = documentId ? `?document_id=${encodeURIComponent(documentId)}` : "";
      return jsonFetch<KnowledgeLineageEntry[]>(
        baseUrl,
        `/api/graphs/${encodeURIComponent(graphId)}/knowledge/lineage${query}`,
        undefined,
        knowledgeLineageEntrySchema.array(),
      );
    },
    // design doc, "LangGraph adapter boundary" — shown in Studio only when
    // a user encounters a capability diagnostic.
    getRuntimeTargetCapabilities: (targetId: string) =>
      jsonFetch<CapabilityMatrix>(
        baseUrl,
        `/api/runtime-targets/${encodeURIComponent(targetId)}/capabilities`,
        undefined,
        capabilityMatrixSchema,
      ),
    // Stored resources (studio-consolidation Phase 3). `.versions` (P1
    // rollout plan, parallel track) is a reusable entity's immutable
    // publish history alongside its mutable CRUD row.
    prompts: {
      ...resourceClient<PromptTemplate>(baseUrl, "prompts", promptTemplateSchema),
      versions: resourceVersionClient(baseUrl, "prompts"),
    },
    tools: {
      ...resourceClient<ToolDefinition>(baseUrl, "tools", toolDefinitionSchema),
      versions: resourceVersionClient(baseUrl, "tools"),
    },
    mcpServers: {
      ...resourceClient<McpServerConfig>(baseUrl, "mcp-servers", mcpServerConfigSchema),
      versions: resourceVersionClient(baseUrl, "mcp-servers"),
    },
    agents: {
      ...resourceClient<AgentProfile>(baseUrl, "agents", agentProfileSchema),
      versions: resourceVersionClient(baseUrl, "agents"),
    },
    llmProfiles: {
      ...resourceClient<LlmProfile>(baseUrl, "llm-profiles", llmProfileSchema),
      versions: resourceVersionClient(baseUrl, "llm-profiles"),
    },
    // Saved Routing Lab fixture datasets (backend/app/resource_models.py's
    // FixtureDataset) — free CRUD, plus one bespoke method that captures a
    // dataset from historical runs (backend/app/datasets.py).
    datasets: resourceClient<FixtureDataset>(baseUrl, "datasets", fixtureDatasetSchema),
    createDatasetFromRuns: (request: {
      name: string;
      description?: string;
      runIds: string[];
      includeNodeOutputs?: boolean;
    }) =>
      jsonFetch<FixtureDataset>(
        baseUrl,
        "/api/datasets/from-runs",
        {
          method: "POST",
          body: JSON.stringify({
            name: request.name,
            description: request.description,
            run_ids: request.runIds,
            include_node_outputs: request.includeNodeOutputs ?? true,
          }),
        },
        fixtureDatasetSchema,
      ),
    // Direct model scratchpad (studio-consolidation Phase 8) — a
    // ChatSession is a stored resource like the others above (free CRUD),
    // plus one bespoke non-CRUD method for actually sending a message.
    chatSessions: resourceClient<ChatSession>(baseUrl, "chat-sessions", chatSessionSchema),
    // `context` (studio-ux-gap-remediation-plan.md §3, STO-596): optional,
    // so every existing caller (and any caller with no graph open) is
    // unaffected — omitting it reproduces the pre-existing behavior
    // exactly.
    sendChatMessage: (sessionId: string, content: string, context?: ChatContext) =>
      jsonFetch<ChatSession>(
        baseUrl,
        `/api/chat-sessions/${encodeURIComponent(sessionId)}/messages`,
        { method: "POST", body: JSON.stringify({ content, context }) },
        chatSessionSchema,
      ),
  };
}

/** SDK 2/7 (STO-615): the run lifecycle -- stream a run's events, wait
 * for it to settle, or start one and get a handle that can wait. */
export type RunsClient = {
  stream(runId: string, options?: RunStreamOptions): AsyncGenerator<PlatformEvent>;
  wait(runId: string, options?: WaitForRunOptions): Promise<RunSummary>;
  start(request: StartRunRequest): Promise<RunHandle>;
};

export type StartRunRequest = {
  graphId: string;
  input: Record<string, unknown>;
  provider?: ChatProvider;
  model?: string;
  apiKey?: string;
  nodeOutputs?: Record<string, unknown>;
};

export type RunHandle = {
  /** The run as the start call returned it (usually queued or running). */
  run: RunSummary;
  stream(options?: RunStreamOptions): AsyncGenerator<PlatformEvent>;
  wait(options?: WaitForRunOptions): Promise<RunSummary>;
};

export type AgentGraphClient = ReturnType<typeof buildMethods> & {
  runs: RunsClient;
  /** SDK 1/7: the same client with per-call options applied to every call
   * made through it -- e.g. `client.with({ signal }).getGraph(id)`. */
  with(options: RequestOptions): AgentGraphClient;
};

function runsClient(transport: Transport, methods: ReturnType<typeof buildMethods>): RunsClient {
  const stream = (runId: string, options?: RunStreamOptions) => streamRun(transport, runId, options);
  const wait = (runId: string, options?: WaitForRunOptions) => waitForRun({ transport, getRun: methods.getRun }, runId, options);
  return {
    stream,
    wait,
    start: async (request) => {
      const run = await methods.startRun(request.graphId, request.input, request.provider, request.model, request.apiKey, request.nodeOutputs);
      return { run, stream: (options) => stream(run.run_id, options), wait: (options) => wait(run.run_id, options) };
    },
  };
}

function scopedClient(transport: Transport): AgentGraphClient {
  const methods = buildMethods(transport);
  return { ...methods, runs: runsClient(transport, methods), with: (options) => scopedClient(transport.with(options)) };
}

export function createAgentGraphClient(options: AgentGraphClientOptions = {}): AgentGraphClient {
  const { onVersionSkew, ...transportOptions } = options;
  let warned = false;
  const report =
    onVersionSkew === false
      ? undefined
      : (onVersionSkew ??
        ((skew: VersionSkew) =>
          console.warn(
            `[agent-graph-sdk] API server is at ${skew.serverVersion}, ahead of this SDK's contract ${skew.clientVersion}; upgrade the SDK for new fields and routes.`,
          )));
  return scopedClient(
    createTransport({
      ...transportOptions,
      onApiVersion: (serverVersion) => {
        transportOptions.onApiVersion?.(serverVersion);
        if (warned || !report || !isServerAhead(serverVersion, CONTRACT_API_VERSION)) return;
        warned = true;
        report({ serverVersion, clientVersion: CONTRACT_API_VERSION });
      },
    }),
  );
}

/**
 * @deprecated SDK 2/7 -- use `client.runs.stream(runId)` (an async
 * iterator that works outside the browser and resumes after drops) or
 * `client.runs.wait(runId, { onEvent })`. Kept as a callback wrapper over
 * the same resumable stream; `onClose` fires once the stream ends for any
 * reason (settled run, no live bus, or error).
 */
export function streamRunEvents(
  baseUrl: string,
  runId: string,
  onEvent: (event: PlatformEvent) => void,
  onClose?: () => void,
): () => void {
  const controller = new AbortController();
  void (async () => {
    try {
      for await (const event of streamRun(createTransport({ baseUrl }), runId, { signal: controller.signal })) onEvent(event);
    } catch {
      // Reported via onClose; callers poll getRun for the outcome.
    } finally {
      if (!controller.signal.aborted) onClose?.();
    }
  })();
  return () => controller.abort();
}
