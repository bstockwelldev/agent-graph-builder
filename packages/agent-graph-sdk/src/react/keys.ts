import type { QueryClient } from "@tanstack/react-query";

/**
 * Query keys for the `/react` hooks (SDK 6/7, STO-618). Every key starts
 * with `["agent-graph"]`, and a graph's keys nest under its id, so one
 * `invalidateQueries({ queryKey })` call can refresh a whole scope.
 */
export const agentGraphKeys = {
  all: ["agent-graph"] as const,
  graphs: () => [...agentGraphKeys.all, "graphs"] as const,
  graph: (graphId: string) => [...agentGraphKeys.graphs(), graphId] as const,
  /** Under `graphs()` so the list invalidation covers it; an object can't
   * collide with a graph id. */
  graphSummaries: () => [...agentGraphKeys.graphs(), { view: "summaries" }] as const,
  releases: (graphId: string) => [...agentGraphKeys.graph(graphId), "releases"] as const,
  health: (graphId: string, draftKey: string) => [...agentGraphKeys.graph(graphId), "health", draftKey] as const,
  impact: (graphId: string, nodeId: string, draftKey: string) => [...agentGraphKeys.graph(graphId), "impact", nodeId, draftKey] as const,
  runs: (graphId?: string) => [...agentGraphKeys.all, "runs", { graphId: graphId ?? null }] as const,
  run: (runId: string) => [...agentGraphKeys.all, "run", runId] as const,
  /** `graphId` omitted: the workspace's policies. */
  policies: (graphId?: string) => [...agentGraphKeys.all, "policies", { graphId: graphId ?? null }] as const,
  resources: (kind: string) => [...agentGraphKeys.all, "resources", kind] as const,
};

/** Cache invalidation after a write, scoped to what the write can change. */
export function agentGraphInvalidation(queryClient: QueryClient) {
  const invalidate = (queryKey: readonly unknown[]) => queryClient.invalidateQueries({ queryKey });
  return {
    /** A graph's own data: definition, releases, health, impact. */
    graph: (graphId: string) => invalidate(agentGraphKeys.graph(graphId)),
    /** The graph list and graph summaries (after create/delete/rename). */
    graphs: () => invalidate(agentGraphKeys.graphs()),
    releases: (graphId: string) => invalidate(agentGraphKeys.releases(graphId)),
    /** Every run list and run. */
    runs: () => Promise.all([invalidate([...agentGraphKeys.all, "runs"]), invalidate([...agentGraphKeys.all, "run"])]),
    /** Workspace and every graph's policies (a workspace change reaches every graph's effective rules). */
    policies: () => invalidate([...agentGraphKeys.all, "policies"]),
    resources: (kind: string) => invalidate(agentGraphKeys.resources(kind)),
    everything: () => invalidate(agentGraphKeys.all),
  };
}
