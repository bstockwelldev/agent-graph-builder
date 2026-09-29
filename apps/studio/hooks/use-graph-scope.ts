"use client";

import { useCallback, useEffect, useState } from "react";
import type { GraphSummary } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";

const STORAGE_KEY = "agb:scope-graph";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(graphId: string | null): void {
  try {
    if (graphId) window.localStorage.setItem(STORAGE_KEY, graphId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Remembering the scope is a convenience; the URL still carries it.
  }
}

/** Mirrors the scope into `?graph=`, keeping every other param. */
function writeUrl(graphId: string | null): void {
  const url = new URL(window.location.href);
  if (graphId) url.searchParams.set("graph", graphId);
  else url.searchParams.delete("graph");
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

export type GraphScope = {
  /** null = the whole workspace. */
  graphId: string | null;
  graph: GraphSummary | null;
  graphs: GraphSummary[];
  /** False until the graph list and the URL/remembered scope are read. */
  ready: boolean;
  setGraphId: (graphId: string | null) => void;
};

/**
 * The Scope shared by Analytics, Policies and the Resources pages
 * (resource-forms-consistency-plan.md §3, slice 4): the whole workspace or
 * one graph. It lives in the URL (`?graph=<id>`, so a link keeps it) and is
 * remembered across pages; a remembered graph that no longer exists falls
 * back to the workspace.
 */
export function useGraphScope(): GraphScope {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [graphId, setGraphIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const requested = new URLSearchParams(window.location.search).get("graph") ?? readStored();
    Promise.resolve()
      .then(() => client.graphs.summaries.list())
      .then(
      (list) => {
        if (cancelled) return;
        const known = requested && list.some((graph) => graph.id === requested) ? requested : null;
        setGraphs(list);
        setGraphIdState(known);
        writeStored(known);
        writeUrl(known);
        setReady(true);
      },
      () => {
        if (!cancelled) setReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setGraphId = useCallback((next: string | null) => {
    setGraphIdState(next);
    writeStored(next);
    writeUrl(next);
  }, []);

  return { graphId, graph: graphs.find((graph) => graph.id === graphId) ?? null, graphs, ready, setGraphId };
}
