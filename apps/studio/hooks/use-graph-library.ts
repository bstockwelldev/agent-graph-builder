"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GraphSummary, SeededDemoSummary } from "@bstockwelldev/agent-graph-sdk";
import { summarizeGraph } from "@bstockwelldev/agent-graph-sdk/graph";

import { client } from "@/lib/api-client";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The graph list and the demo gallery (canvas-first-landing-plan.md §3), shared
 * by the graph picker, the header's graph switcher and the `/graphs` page so a
 * fix to loading or demo filtering lands in one place (#173).
 *
 * `/api/graph-summaries` returns the seeded demos too (subgraph pickers need
 * them), so `ownGraphs` drops them: each demo shows once, in the gallery,
 * away from delete buttons.
 */
export function useGraphLibrary({ lazy = false }: { lazy?: boolean } = {}) {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [demos, setDemos] = useState<SeededDemoSummary[]>([]);
  const [loading, setLoading] = useState(!lazy);
  // `loadError` replaces the list (there is nothing to show); `actionError`
  // (a failed create or delete) sits above it, so the list stays usable.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    // Fetched together, so the list never renders before it knows which
    // graphs are demos. The gallery is additive: a demos failure never
    // blocks the graph list.
    const [summaries, gallery] = await Promise.allSettled([client.graphs.summaries.list(), client.demos.list()]);
    setDemos(gallery.status === "fulfilled" ? gallery.value : []);
    if (summaries.status === "fulfilled") setGraphs(summaries.value);
    else setLoadError(message(summaries.reason));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!lazy) void refetch();
  }, [lazy, refetch]);

  const ownGraphs = useMemo(() => {
    const demoIds = new Set(demos.map((demo) => demo.id));
    return graphs.filter((graph) => !demoIds.has(graph.id));
  }, [demos, graphs]);

  /** Creates a blank graph; resolves to its summary, or null (with `actionError` set) on failure. */
  const create = useCallback(async (): Promise<GraphSummary | null> => {
    setActionError(null);
    try {
      const created = await client.graphs.create({ name: `New graph ${new Date().toLocaleTimeString()}`, template: "blank" });
      const summary = summarizeGraph(created);
      setGraphs((prev) => [summary, ...prev]);
      return summary;
    } catch (err) {
      setActionError(message(err));
      return null;
    }
  }, []);

  /** Deletes a graph; resolves to whether it went (a failure leaves the list as it was and sets `actionError`). */
  const remove = useCallback(async (graphId: string): Promise<boolean> => {
    setActionError(null);
    try {
      await client.graphs.delete(graphId);
      setGraphs((prev) => prev.filter((graph) => graph.id !== graphId));
      return true;
    } catch (err) {
      setActionError(message(err));
      return false;
    }
  }, []);

  return { graphs, ownGraphs, demos, loading, loadError, actionError, setActionError, refetch, create, remove };
}
