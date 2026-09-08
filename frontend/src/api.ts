import type { CompileResult, GraphDefinition, NodeTrace, PlatformEvent, ProviderCredentials, ProviderModelCatalog, RunSummary, ChatProvider } from "./types";

// Same-origin requests go through the Vite dev proxy (/api -> backend), so the
// UI works on any local port (5173, 5174, …) without CORS. Override only when
// pointing at a remote API.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status}): ${body}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listGraphs: () => jsonFetch<GraphDefinition[]>("/api/graphs"),
  listRuns: (graphId: string) => jsonFetch<RunSummary[]>(`/api/graphs/${graphId}/runs`),
  getRun: (runId: string) => jsonFetch<RunSummary>(`/api/runs/${runId}`),
  createGraph: (name: string, template: "blank" | "demo") =>
    jsonFetch<GraphDefinition>("/api/graphs", {
      method: "POST",
      body: JSON.stringify({ name, template }),
    }),
  getGraph: (id: string) => jsonFetch<GraphDefinition>(`/api/graphs/${id}`),
  saveGraph: (graph: GraphDefinition) =>
    jsonFetch<GraphDefinition>(`/api/graphs/${graph.id}`, {
      method: "PUT",
      body: JSON.stringify(graph),
    }),
  validateGraph: (graph: GraphDefinition) =>
    jsonFetch<CompileResult>("/api/graphs/validate", {
      method: "POST",
      body: JSON.stringify(graph),
    }),
  compileGraph: (id: string) => jsonFetch<CompileResult>(`/api/graphs/${id}/compile`, { method: "POST" }),
  startRun: (graphId: string, input: Record<string, unknown>, provider?: ChatProvider, model?: string, apiKey?: string) =>
    jsonFetch<RunSummary>("/api/runs", {
      method: "POST",
      body: JSON.stringify({ graph_id: graphId, input, provider, model, api_key: apiKey }),
    }),
  getRunNodeTraces: (runId: string) => jsonFetch<NodeTrace[]>(`/api/runs/${runId}/nodes`),
  providerReady: (provider: ChatProvider) =>
    jsonFetch<{ ready: boolean; message: string }>(`/api/providers/${provider}/ready`),
  providerCredentials: (provider: ChatProvider) =>
    jsonFetch<ProviderCredentials>(`/api/providers/${provider}/credentials`),
  listProviderModels: (provider: ChatProvider, graphId?: string) => {
    const query = graphId ? `?graph_id=${encodeURIComponent(graphId)}` : "";
    return jsonFetch<ProviderModelCatalog>(`/api/providers/${provider}/models${query}`);
  },
};

export function streamRunEvents(runId: string, onEvent: (event: PlatformEvent) => void, onClose?: () => void): () => void {
  const source = new EventSource(`${BASE_URL}/api/runs/${runId}/events`);
  source.onmessage = (message) => {
    onEvent(JSON.parse(message.data) as PlatformEvent);
  };
  source.onerror = () => {
    source.close();
    onClose?.();
  };
  return () => source.close();
}
