import type { z } from "zod";

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
  policyExceptionSchema,
  promptTemplateSchema,
  providerCredentialsSchema,
  providerModelCatalogSchema,
  providerReadySchema,
  publishReleaseResponseSchema,
  publishResourceVersionResponseSchema,
  releaseDiffSchema,
  releaseIndexEntrySchema,
  resourceVersionIndexEntrySchema,
  resourceVersionSchema,
  routingComparisonSchema,
  routingLabReportSchema,
  runGraphSnapshotSchema,
  runSummarySchema,
  graphAnalyticsSchema,
  nodeExecutionSchema,
  simulateResultSchema,
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
  PolicyException,
  ProviderCredentials,
  ProviderModelCatalog,
  PromptTemplate,
  PublishReleaseResponse,
  PublishResourceVersionResponse,
  ReleaseDiff,
  ReleaseIndexEntry,
  ResourceVersion,
  ResourceVersionIndexEntry,
  RoutingComparison,
  RoutingLabReport,
  RunGraphSnapshot,
  RunSummary,
  SimulateResult,
  ToolDefinition,
} from "./types.js";

export type AgentGraphClientOptions = {
  baseUrl?: string;
};

/**
 * `schema` is optional so callers that don't (yet) have a Zod schema for a
 * given response can still use `jsonFetch` — but every method on
 * `createAgentGraphClient` below passes one, so in practice every response
 * this SDK returns is runtime-validated (studio-consolidation Phase 4f).
 */
async function jsonFetch<T>(baseUrl: string, path: string, init?: RequestInit, schema?: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status}): ${body}`);
  }
  const data: unknown = await response.json();
  if (!schema) {
    return data as T;
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`${init?.method ?? "GET"} ${path} returned an unexpected shape: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Generic CRUD for one of the five stored resource kinds
 * (studio-consolidation Phase 3 — see backend/app/main.py's
 * `_register_resource_routes` and resource_models.py). Each resource type
 * has an `id` field, so create/update both take the full object.
 */
function resourceClient<T extends { id: string }>(baseUrl: string, path: string, schema: z.ZodType<T>) {
  return {
    list: () => jsonFetch<T[]>(baseUrl, `/api/${path}`, undefined, schema.array()),
    get: (id: string) => jsonFetch<T>(baseUrl, `/api/${path}/${id}`, undefined, schema),
    create: (resource: T) =>
      jsonFetch<T>(baseUrl, `/api/${path}`, { method: "POST", body: JSON.stringify(resource) }, schema),
    update: (resource: T) =>
      jsonFetch<T>(
        baseUrl,
        `/api/${path}/${resource.id}`,
        { method: "PUT", body: JSON.stringify(resource) },
        schema,
      ),
    delete: (id: string) =>
      jsonFetch<{ deleted: boolean }>(baseUrl, `/api/${path}/${id}`, { method: "DELETE" }, deletedSchema),
  };
}

/**
 * P1 rollout plan, parallel track ("Versioned reusable entity registry")
 * — POST/GET /api/{path}/{resource_id}/versions[/{version_id}]. Attached
 * to a resourceClient's return value as `.versions` for prompts, tools,
 * mcp-servers, agents, and llm-profiles — never chat-sessions, which
 * backend/app/resource_versions.py's VERSIONABLE_RESOURCE_KINDS excludes.
 */
function resourceVersionClient(baseUrl: string, path: string) {
  return {
    publish: (resourceId: string) =>
      jsonFetch<PublishResourceVersionResponse>(
        baseUrl,
        `/api/${path}/${resourceId}/versions`,
        { method: "POST" },
        publishResourceVersionResponseSchema,
      ),
    list: (resourceId: string) =>
      jsonFetch<ResourceVersionIndexEntry[]>(
        baseUrl,
        `/api/${path}/${resourceId}/versions`,
        undefined,
        resourceVersionIndexEntrySchema.array(),
      ),
    get: (resourceId: string, versionId: string) =>
      jsonFetch<ResourceVersion>(
        baseUrl,
        `/api/${path}/${resourceId}/versions/${versionId}`,
        undefined,
        resourceVersionSchema,
      ),
  };
}

export function createAgentGraphClient(options: AgentGraphClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";

  return {
    listGraphs: () => jsonFetch<GraphDefinition[]>(baseUrl, "/api/graphs", undefined, graphDefinitionSchema.array()),
    listRuns: (graphId: string) =>
      jsonFetch<RunSummary[]>(baseUrl, `/api/graphs/${graphId}/runs`, undefined, runSummarySchema.array()),
    /** Cross-graph run history (studio-consolidation Phase 5) — flagged as
     * a gap in Phase 4c's as-built notes; `listRuns` above stays the
     * per-graph route the Runs screen uses. */
    listAllRuns: () => jsonFetch<RunSummary[]>(baseUrl, "/api/runs", undefined, runSummarySchema.array()),
    getRun: (runId: string) => jsonFetch<RunSummary>(baseUrl, `/api/runs/${runId}`, undefined, runSummarySchema),
    createGraph: (name: string, template: "blank" | "demo") =>
      jsonFetch<GraphDefinition>(
        baseUrl,
        "/api/graphs",
        { method: "POST", body: JSON.stringify({ name, template }) },
        graphDefinitionSchema,
      ),
    getGraph: (id: string) =>
      jsonFetch<GraphDefinition>(baseUrl, `/api/graphs/${id}`, undefined, graphDefinitionSchema),
    saveGraph: (graph: GraphDefinition) =>
      jsonFetch<GraphDefinition>(
        baseUrl,
        `/api/graphs/${graph.id}`,
        { method: "PUT", body: JSON.stringify(graph) },
        graphDefinitionSchema,
      ),
    /** Added for studio-consolidation Phase 3 — graphs were previously
     * never deletable through this API. */
    deleteGraph: (id: string) =>
      jsonFetch<{ deleted: boolean }>(baseUrl, `/api/graphs/${id}`, { method: "DELETE" }, deletedSchema),
    validateGraph: (graph: GraphDefinition, init?: { signal?: AbortSignal }) =>
      jsonFetch<CompileResult>(
        baseUrl,
        "/api/graphs/validate",
        { method: "POST", body: JSON.stringify(graph), signal: init?.signal },
        compileResultSchema,
      ),
    compileGraph: (id: string) =>
      jsonFetch<CompileResult>(baseUrl, `/api/graphs/${id}/compile`, { method: "POST" }, compileResultSchema),
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
      jsonFetch<NodeTrace[]>(baseUrl, `/api/runs/${runId}/nodes`, undefined, nodeTraceSchema.array()),
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
        `/api/runs/${runId}/snapshot`,
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
        `/api/runs/${runId}/resume`,
        { method: "POST", body: JSON.stringify({ approve, reason }) },
        runSummarySchema,
      ),
    providerReady: (provider: ChatProvider) =>
      jsonFetch<{ ready: boolean; message: string }>(
        baseUrl,
        `/api/providers/${provider}/ready`,
        undefined,
        providerReadySchema,
      ),
    providerCredentials: (provider: ChatProvider) =>
      jsonFetch<ProviderCredentials>(
        baseUrl,
        `/api/providers/${provider}/credentials`,
        undefined,
        providerCredentialsSchema,
      ),
    listProviderModels: (provider: ChatProvider, graphId?: string) => {
      const query = graphId ? `?graph_id=${encodeURIComponent(graphId)}` : "";
      return jsonFetch<ProviderModelCatalog>(
        baseUrl,
        `/api/providers/${provider}/models${query}`,
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
        `/api/graphs/${graphId}/releases`,
        {
          method: "POST",
          body: JSON.stringify({ release_notes: releaseNotes, author }),
        },
        publishReleaseResponseSchema,
      ),
    listReleases: (graphId: string) =>
      jsonFetch<ReleaseIndexEntry[]>(
        baseUrl,
        `/api/graphs/${graphId}/releases`,
        undefined,
        releaseIndexEntrySchema.array(),
      ),
    getRelease: (graphId: string, releaseId: string) =>
      jsonFetch<GraphRelease>(
        baseUrl,
        `/api/graphs/${graphId}/releases/${releaseId}`,
        undefined,
        graphReleaseSchema,
      ),
    // release_id-only routes (no graph_id in the path) — the backend
    // resolves the owning graph via storage.get_release_graph_id.
    compileRelease: (releaseId: string) =>
      jsonFetch<CompileResult>(
        baseUrl,
        `/api/graph-releases/${releaseId}/compile`,
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
        `/api/graph-releases/${releaseId}/runs`,
        { method: "POST", body: JSON.stringify({ input, provider, model, api_key: apiKey }) },
        runSummarySchema,
      ),
    // P1 rollout plan, Slice A ("Semantic release comparison") — a
    // categorized behavior-level diff between two releases (node config,
    // edge/router, port/contract, and resource_snapshots deltas).
    compareReleases: (releaseId: string, otherReleaseId: string) =>
      jsonFetch<ReleaseDiff>(
        baseUrl,
        `/api/graph-releases/${releaseId}/compare/${otherReleaseId}`,
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
        `/api/graphs/${graphId}/simulate`,
        { method: "POST", body: JSON.stringify(fixture) },
        simulateResultSchema,
      ),
    simulateRelease: (releaseId: string, fixture: Fixture) =>
      jsonFetch<SimulateResult>(
        baseUrl,
        `/api/graph-releases/${releaseId}/simulate`,
        { method: "POST", body: JSON.stringify(fixture) },
        simulateResultSchema,
      ),
    // P1 rollout plan, Slice C ("Historical replay") — read-only
    // re-execution of a past run's exact graph, every non-routing node's
    // original output frozen. Same result shape as simulate — the run
    // history UI can render either through one component. Deliberately
    // named `replayRun`, not reusing the unrelated `"replayed"` trace-event
    // flag human_gate resume already uses.
    replayRun: (runId: string) =>
      jsonFetch<SimulateResult>(
        baseUrl,
        `/api/runs/${runId}/replay`,
        { method: "POST" },
        simulateResultSchema,
      ),
    // P1 rollout plan, Slice D ("Routing policy lab") — runs a graph once
    // per fixture in `dataset` (via simulate, so no live tool/LLM call for
    // any node a fixture stubs) and aggregates the resulting route
    // decisions into a per-router/branch-node distribution.
    runRoutingDataset: (graphId: string, dataset: Fixture[]) =>
      jsonFetch<RoutingLabReport>(
        baseUrl,
        `/api/graphs/${graphId}/routing-lab/run`,
        { method: "POST", body: JSON.stringify({ dataset }) },
        routingLabReportSchema,
      ),
    compareRoutingDatasets: (graphId: string, otherGraphId: string, dataset: Fixture[]) =>
      jsonFetch<RoutingComparison>(
        baseUrl,
        `/api/graphs/${graphId}/routing-lab/compare/${otherGraphId}`,
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
        `/api/graphs/${graphId}/policy-exceptions`,
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
        `/api/graphs/${graphId}/policy-exceptions`,
        undefined,
        policyExceptionSchema.array(),
      ),
    deletePolicyException: (graphId: string, exceptionId: string) =>
      jsonFetch<{ deleted: boolean }>(
        baseUrl,
        `/api/graphs/${graphId}/policy-exceptions/${exceptionId}`,
        { method: "DELETE" },
        deletedSchema,
      ),
    // Knowledge base (studio-consolidation Phase 5, backend/app/knowledge.py):
    // per-graph .txt/.md documents, chunked + embedded on upload. The upload
    // sends `headers: {}` so `jsonFetch`'s JSON Content-Type default doesn't
    // apply — the browser must set the multipart boundary itself.
    getKnowledge: (graphId: string) =>
      jsonFetch<KnowledgeSummary>(baseUrl, `/api/graphs/${graphId}/knowledge`, undefined, knowledgeSummarySchema),
    uploadKnowledgeDocument: (graphId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return jsonFetch<KnowledgeUploadResponse>(
        baseUrl,
        `/api/graphs/${graphId}/knowledge`,
        { method: "POST", body: form, headers: {} },
        knowledgeUploadResponseSchema,
      );
    },
    deleteKnowledgeDocument: (graphId: string, documentId: string) =>
      jsonFetch<KnowledgeDeleteResponse>(
        baseUrl,
        `/api/graphs/${graphId}/knowledge/${documentId}`,
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
        `/api/graphs/${graphId}/knowledge/lineage${query}`,
        undefined,
        knowledgeLineageEntrySchema.array(),
      );
    },
    // design doc, "LangGraph adapter boundary" — shown in Studio only when
    // a user encounters a capability diagnostic.
    getRuntimeTargetCapabilities: (targetId: string) =>
      jsonFetch<CapabilityMatrix>(
        baseUrl,
        `/api/runtime-targets/${targetId}/capabilities`,
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
        `/api/chat-sessions/${sessionId}/messages`,
        { method: "POST", body: JSON.stringify({ content, context }) },
        chatSessionSchema,
      ),
  };
}

export type AgentGraphClient = ReturnType<typeof createAgentGraphClient>;

export function streamRunEvents(
  baseUrl: string,
  runId: string,
  onEvent: (event: PlatformEvent) => void,
  onClose?: () => void,
): () => void {
  const source = new EventSource(`${baseUrl}/api/runs/${runId}/events`);
  source.onmessage = (message) => {
    onEvent(JSON.parse(message.data) as PlatformEvent);
  };
  source.onerror = () => {
    source.close();
    onClose?.();
  };
  return () => source.close();
}
