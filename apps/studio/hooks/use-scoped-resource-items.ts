"use client";

import { useEffect, useState } from "react";

import type { AnyResourceKind, ResourceKindId, ResourceLike } from "@/components/studio/resource-kinds";
import { useGraphScope, type GraphScope } from "@/hooks/use-graph-scope";
import { client } from "@/lib/api-client";
import { errorDetail } from "@/lib/apiErrors";

/** Each kind's key in `GET /api/graphs/{id}/resources`. */
const SCOPE_KEY: Record<ResourceKindId, string> = {
  prompts: "prompts",
  tools: "tools",
  agents: "agents",
  mcp: "mcp-servers",
  llmProfiles: "llm-profiles",
  transforms: "transforms",
  datasets: "datasets",
  evalSuites: "eval-suites",
};

/** With a graph in scope: the ids of this kind it uses (null while loading). */
function useScopedIds(kind: AnyResourceKind, graphId: string | null, refreshKey: unknown) {
  const [state, setState] = useState<{ graphId: string; ids: Set<string> | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!graphId) {
      setState(null);
      return;
    }
    let cancelled = false;
    setState({ graphId, ids: null, error: null });
    client.graphs.resources(graphId).then(
      ({ ids }) => !cancelled && setState({ graphId, ids: new Set(ids[SCOPE_KEY[kind.id]] ?? []), error: null }),
      (err: unknown) => !cancelled && setState({ graphId, ids: null, error: errorDetail(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [graphId, kind.id, refreshKey]);
  return state?.graphId === graphId ? state : null;
}

/**
 * The Scope (workspace or one graph) applied to one resource registry's list
 * (resource-forms-consistency-plan.md §3, slice 4). Shared by the full page
 * and the workbench panel so both narrow, and remember, the same way.
 */
export function useScopedResourceItems<T extends ResourceLike>(kind: AnyResourceKind, allItems: T[]) {
  const scope: GraphScope = useGraphScope();
  const scoped = useScopedIds(kind, scope.graphId, allItems);
  const items = scoped?.ids ? allItems.filter((item) => scoped.ids!.has(item.id)) : allItems;
  const noun = kind.panelTitle.toLowerCase();
  /** The one-line status above the list when a graph is in scope; null for the workspace. */
  const status = scope.graph
    ? scoped?.error
      ? `Couldn't load what ${scope.graph.name} uses: ${scoped.error}`
      : scoped?.ids
        ? `${items.length} of ${allItems.length} ${noun} used by ${scope.graph.name}.`
        : `Loading what ${scope.graph.name} uses…`
    : null;
  const emptyText = scope.graph && scoped?.ids ? `${scope.graph.name} uses no ${noun}.` : kind.emptyText;
  return { scope, items, status, emptyText };
}
