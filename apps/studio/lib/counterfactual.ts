import type { GraphDefinition, NodeTrace, ReplayNodeMode, ReplayRequest } from "@bstockwelldev/agent-graph-sdk";

/**
 * Pure helpers for counterfactual replay (STO-609, backend/app/replay.py):
 * what can be changed in a recorded run's graph, the request those choices
 * build, and how the result compares with the original run.
 */

type Graph = Pick<GraphDefinition, "nodes" | "edges">;

export type RouteChoice = { nodeId: string; targets: string[] };
export type ModelChoice = { nodeId: string; recordedModel: string | null };

/** Routers/branches and the targets each could be pinned to. */
export function routeChoices(graph: Graph): RouteChoice[] {
  return graph.nodes
    .filter((node) => node.type === "router" || node.type === "branch")
    .map((node) => ({
      nodeId: node.id,
      targets: [...new Set(graph.edges.filter((edge) => edge.source === node.id).map((edge) => edge.target))],
    }))
    .filter((choice) => choice.targets.length > 0);
}

/** LLM / tool_loop nodes whose provider/model can be swapped. */
export function modelChoices(graph: Graph): ModelChoice[] {
  return graph.nodes
    .filter((node) => node.type === "llm" || node.type === "tool_loop")
    .map((node) => ({ nodeId: node.id, recordedModel: typeof node.config?.model === "string" ? node.config.model : null }));
}

export type CounterfactualDraft = {
  /** node id -> target node id ("" = as recorded) */
  routes: Record<string, string>;
  /** node id -> provider ("" = as recorded) and optional model */
  models: Record<string, { provider: string; model: string }>;
  liveAffected: boolean;
};

export const EMPTY_DRAFT: CounterfactualDraft = { routes: {}, models: {}, liveAffected: false };

/** The request for the chosen changes, or null when nothing differs from the recording. */
export function buildReplayRequest(draft: CounterfactualDraft): ReplayRequest | null {
  const forced_routes = Object.fromEntries(Object.entries(draft.routes).filter(([, target]) => target));
  const model_overrides = Object.fromEntries(
    Object.entries(draft.models)
      .filter(([, choice]) => choice.provider)
      .map(([nodeId, choice]) => [nodeId, { provider: choice.provider, model: choice.model.trim() || null }]),
  );
  if (Object.keys(forced_routes).length === 0 && Object.keys(model_overrides).length === 0) return null;
  return { forced_routes, model_overrides, live_affected: draft.liveAffected };
}

export const MODE_LABEL: Record<ReplayNodeMode, string> = {
  frozen: "Frozen",
  recomputed: "Recomputed",
  live: "Live",
  stub_fallback: "Stub fallback",
  forced: "Forced route",
};

export type NodeComparison = { nodeId: string; mode: ReplayNodeMode | null; before: unknown; after: unknown; changed: boolean; onlyIn: "original" | "replay" | null };

/**
 * One row per node in either run, replay order first; nodes that only ran
 * originally (a branch no longer taken) come last.
 */
export function compareNodes(
  original: readonly NodeTrace[],
  replayed: readonly NodeTrace[],
  modes: Record<string, ReplayNodeMode>,
  changed: readonly string[],
): NodeComparison[] {
  const before = new Map(original.map((trace) => [trace.node_id, trace.output]));
  const after = new Map(replayed.map((trace) => [trace.node_id, trace.output]));
  const changedSet = new Set(changed);
  const order = [...replayed.map((t) => t.node_id), ...original.map((t) => t.node_id).filter((id) => !after.has(id))];
  return order.map((nodeId) => ({
    nodeId,
    mode: modes[nodeId] ?? null,
    before: before.get(nodeId),
    after: after.get(nodeId),
    changed: changedSet.has(nodeId),
    onlyIn: !before.has(nodeId) ? "replay" : !after.has(nodeId) ? "original" : null,
  }));
}
