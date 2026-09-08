import type { CompileResult, GraphDefinition, NodeTrace, PlatformEvent, RunSummary } from "./types";

const BASE_URL = "http://localhost:8000";

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
  getGraph: (id: string) => jsonFetch<GraphDefinition>(`/api/graphs/${id}`),
  saveGraph: (graph: GraphDefinition) =>
    jsonFetch<GraphDefinition>(`/api/graphs/${graph.id}`, {
      method: "PUT",
      body: JSON.stringify(graph),
    }),
  compileGraph: (id: string) => jsonFetch<CompileResult>(`/api/graphs/${id}/compile`, { method: "POST" }),
  startRun: (graphId: string, input: Record<string, unknown>) =>
    jsonFetch<RunSummary>("/api/runs", {
      method: "POST",
      body: JSON.stringify({ graph_id: graphId, input }),
    }),
  getRunNodeTraces: (runId: string) => jsonFetch<NodeTrace[]>(`/api/runs/${runId}/nodes`),
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
