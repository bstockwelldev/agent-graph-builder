import type { z } from "zod";

import {
  agentProfileSchema,
  analyticsDashboardPayloadSchema,
  capabilityMatrixSchema,
  chatSessionSchema,
  compileResultSchema,
  deletedSchema,
  graphDefinitionSchema,
  graphReleaseSchema,
  llmProfileSchema,
  mcpServerConfigSchema,
  nodeTraceSchema,
  promptTemplateSchema,
  providerCredentialsSchema,
  providerModelCatalogSchema,
  providerReadySchema,
  publishReleaseResponseSchema,
  releaseDiffSchema,
  releaseIndexEntrySchema,
  runGraphSnapshotSchema,
  runSummarySchema,
  simulateResultSchema,
  toolDefinitionSchema,
} from "./schemas.js";
import type {
  AgentProfile,
  AnalyticsDashboardPayload,
  CapabilityMatrix,
  ChatProvider,
  ChatSession,
  CompileResult,
  Fixture,
  GraphDefinition,
  GraphRelease,
  LlmProfile,
  McpServerConfig,
  NodeTrace,
  PlatformEvent,
  ProviderCredentials,
  ProviderModelCatalog,
  PromptTemplate,
  PublishReleaseResponse,
  ReleaseDiff,
  ReleaseIndexEntry,
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
    ) =>
      jsonFetch<RunSummary>(
        baseUrl,
        "/api/runs",
        { method: "POST", body: JSON.stringify({ graph_id: graphId, input, provider, model, api_key: apiKey }) },
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
    // design doc, "LangGraph adapter boundary" — shown in Studio only when
    // a user encounters a capability diagnostic.
    getRuntimeTargetCapabilities: (targetId: string) =>
      jsonFetch<CapabilityMatrix>(
        baseUrl,
        `/api/runtime-targets/${targetId}/capabilities`,
        undefined,
        capabilityMatrixSchema,
      ),
    // Stored resources (studio-consolidation Phase 3).
    prompts: resourceClient<PromptTemplate>(baseUrl, "prompts", promptTemplateSchema),
    tools: resourceClient<ToolDefinition>(baseUrl, "tools", toolDefinitionSchema),
    mcpServers: resourceClient<McpServerConfig>(baseUrl, "mcp-servers", mcpServerConfigSchema),
    agents: resourceClient<AgentProfile>(baseUrl, "agents", agentProfileSchema),
    llmProfiles: resourceClient<LlmProfile>(baseUrl, "llm-profiles", llmProfileSchema),
    // Direct model scratchpad (studio-consolidation Phase 8) — a
    // ChatSession is a stored resource like the others above (free CRUD),
    // plus one bespoke non-CRUD method for actually sending a message.
    chatSessions: resourceClient<ChatSession>(baseUrl, "chat-sessions", chatSessionSchema),
    sendChatMessage: (sessionId: string, content: string) =>
      jsonFetch<ChatSession>(
        baseUrl,
        `/api/chat-sessions/${sessionId}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
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
