import type { GraphSummary } from "@bstockwelldev/agent-graph-sdk";

/**
 * Graph-as-node subgraphs (large-graph complexity, Wave 7c / STO-612) --
 * pure helpers for the subgraph node's Configure tab. Mirror
 * backend/app/subgraphs.py.
 */

/** Graphs a subgraph node in `currentId` may reference: never itself, and
 * never a graph whose own references (followed through `graphs`) lead
 * back to it -- the client-side twin of the compiler's SUBGRAPH_CYCLE.
 * `subgraph_ids` comes from the graph summaries (server-computed). */
export function referenceableGraphs<T extends Pick<GraphSummary, "id" | "subgraph_ids">>(graphs: T[], currentId: string): T[] {
  const byId = new Map(graphs.map((graph) => [graph.id, graph]));
  const reachesCurrent = (start: string): boolean => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === currentId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const graph = byId.get(id);
      if (graph) stack.push(...graph.subgraph_ids);
    }
    return false;
  };
  return graphs.filter((graph) => graph.id !== currentId && !reachesCurrent(graph.id));
}

/** Next `inputMapping` after editing one row: blank rows are dropped, and
 * an empty mapping becomes `undefined` (the default wiring). */
export function setMappingRow(
  mapping: Record<string, string> | undefined,
  variable: string,
  template: string,
): Record<string, string> | undefined {
  const next = { ...(mapping ?? {}) };
  if (template.trim()) next[variable] = template;
  else delete next[variable];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Where a subgraph node's nested run lives: from the trace input on
 * success, or parsed from the error ("child run <id> failed: …") when the
 * child failed, using the node's configured graph. */
export function childRunHref(
  trace: { input?: unknown; error?: string | null },
  configuredGraphId?: string | null,
): string | null {
  const input = (trace.input ?? {}) as { childRunId?: unknown; graphId?: unknown };
  const runId = typeof input.childRunId === "string" ? input.childRunId : trace.error?.match(/child run (run_[A-Za-z0-9]+)/)?.[1];
  const graphId = typeof input.graphId === "string" ? input.graphId : configuredGraphId;
  if (!runId || !graphId) return null;
  return `/graphs/${encodeURIComponent(graphId)}?run=${encodeURIComponent(runId)}&panel=run`;
}
