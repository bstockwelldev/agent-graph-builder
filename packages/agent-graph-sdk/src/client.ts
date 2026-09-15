import type {
  AgentProfile,
  ChatProvider,
  CompileResult,
  GraphDefinition,
  LlmProfile,
  McpServerConfig,
  NodeTrace,
  PlatformEvent,
  ProviderCredentials,
  ProviderModelCatalog,
  PromptTemplate,
  RunSummary,
  ToolDefinition,
} from "./types.js";

export type AgentGraphClientOptions = {
  baseUrl?: string;
};

async function jsonFetch<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status}): ${body}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Generic CRUD for one of the five stored resource kinds
 * (studio-consolidation Phase 3 — see backend/app/main.py's
 * `_register_resource_routes` and resource_models.py). Each resource type
 * has an `id` field, so create/update both take the full object.
 */
function resourceClient<T extends { id: string }>(baseUrl: string, path: string) {
  return {
    list: () => jsonFetch<T[]>(baseUrl, `/api/${path}`),
    get: (id: string) => jsonFetch<T>(baseUrl, `/api/${path}/${id}`),
    create: (resource: T) =>
      jsonFetch<T>(baseUrl, `/api/${path}`, { method: "POST", body: JSON.stringify(resource) }),
    update: (resource: T) =>
      jsonFetch<T>(baseUrl, `/api/${path}/${resource.id}`, { method: "PUT", body: JSON.stringify(resource) }),
    delete: (id: string) =>
      jsonFetch<{ deleted: boolean }>(baseUrl, `/api/${path}/${id}`, { method: "DELETE" }),
  };
}

export function createAgentGraphClient(options: AgentGraphClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";

  return {
    listGraphs: () => jsonFetch<GraphDefinition[]>(baseUrl, "/api/graphs"),
    listRuns: (graphId: string) => jsonFetch<RunSummary[]>(baseUrl, `/api/graphs/${graphId}/runs`),
    getRun: (runId: string) => jsonFetch<RunSummary>(baseUrl, `/api/runs/${runId}`),
    createGraph: (name: string, template: "blank" | "demo") =>
      jsonFetch<GraphDefinition>(baseUrl, "/api/graphs", {
        method: "POST",
        body: JSON.stringify({ name, template }),
      }),
    getGraph: (id: string) => jsonFetch<GraphDefinition>(baseUrl, `/api/graphs/${id}`),
    saveGraph: (graph: GraphDefinition) =>
      jsonFetch<GraphDefinition>(baseUrl, `/api/graphs/${graph.id}`, {
        method: "PUT",
        body: JSON.stringify(graph),
      }),
    /** Added for studio-consolidation Phase 3 — graphs were previously
     * never deletable through this API. */
    deleteGraph: (id: string) =>
      jsonFetch<{ deleted: boolean }>(baseUrl, `/api/graphs/${id}`, { method: "DELETE" }),
    validateGraph: (graph: GraphDefinition, init?: { signal?: AbortSignal }) =>
      jsonFetch<CompileResult>(baseUrl, "/api/graphs/validate", {
        method: "POST",
        body: JSON.stringify(graph),
        signal: init?.signal,
      }),
    compileGraph: (id: string) => jsonFetch<CompileResult>(baseUrl, `/api/graphs/${id}/compile`, { method: "POST" }),
    startRun: (
      graphId: string,
      input: Record<string, unknown>,
      provider?: ChatProvider,
      model?: string,
      apiKey?: string,
    ) =>
      jsonFetch<RunSummary>(baseUrl, "/api/runs", {
        method: "POST",
        body: JSON.stringify({ graph_id: graphId, input, provider, model, api_key: apiKey }),
      }),
    getRunNodeTraces: (runId: string) => jsonFetch<NodeTrace[]>(baseUrl, `/api/runs/${runId}/nodes`),
    /**
     * Resolves a `human_gate` checkpoint (studio-consolidation Phase 2).
     * `approve` defaults to true; pass false to fail the run instead of
     * resuming it. 404s when there is nothing paused for this run id.
     */
    resumeRun: (runId: string, approve = true, reason?: string) =>
      jsonFetch<RunSummary>(baseUrl, `/api/runs/${runId}/resume`, {
        method: "POST",
        body: JSON.stringify({ approve, reason }),
      }),
    providerReady: (provider: ChatProvider) =>
      jsonFetch<{ ready: boolean; message: string }>(baseUrl, `/api/providers/${provider}/ready`),
    providerCredentials: (provider: ChatProvider) =>
      jsonFetch<ProviderCredentials>(baseUrl, `/api/providers/${provider}/credentials`),
    listProviderModels: (provider: ChatProvider, graphId?: string) => {
      const query = graphId ? `?graph_id=${encodeURIComponent(graphId)}` : "";
      return jsonFetch<ProviderModelCatalog>(baseUrl, `/api/providers/${provider}/models${query}`);
    },
    // Stored resources (studio-consolidation Phase 3).
    prompts: resourceClient<PromptTemplate>(baseUrl, "prompts"),
    tools: resourceClient<ToolDefinition>(baseUrl, "tools"),
    mcpServers: resourceClient<McpServerConfig>(baseUrl, "mcp-servers"),
    agents: resourceClient<AgentProfile>(baseUrl, "agents"),
    llmProfiles: resourceClient<LlmProfile>(baseUrl, "llm-profiles"),
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
