import type {
  ChatProvider,
  CompileResult,
  GraphDefinition,
  NodeTrace,
  PlatformEvent,
  ProviderCredentials,
  ProviderModelCatalog,
  RunSummary,
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
    providerReady: (provider: ChatProvider) =>
      jsonFetch<{ ready: boolean; message: string }>(baseUrl, `/api/providers/${provider}/ready`),
    providerCredentials: (provider: ChatProvider) =>
      jsonFetch<ProviderCredentials>(baseUrl, `/api/providers/${provider}/credentials`),
    listProviderModels: (provider: ChatProvider, graphId?: string) => {
      const query = graphId ? `?graph_id=${encodeURIComponent(graphId)}` : "";
      return jsonFetch<ProviderModelCatalog>(baseUrl, `/api/providers/${provider}/models${query}`);
    },
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
