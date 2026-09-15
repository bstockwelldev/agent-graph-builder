"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

// Placeholder canvas route: the real graph editor (dagre layout, node
// palette, inspector, live validation) is ported in Phase 4d. This page
// exists now so the shell's full-bleed graph-canvas layout and the
// /graphs -> /graphs/:id navigation are exercisable end-to-end ahead of it.
export default function GraphDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [graph, setGraph] = useState<GraphDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    client
      .getGraph(id)
      .then((loaded) => {
        if (!cancelled) setGraph(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/graphs" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          &larr; Graphs
        </Link>
        {graph ? (
          <Link
            href={`/runs/${graph.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View runs
          </Link>
        ) : null}
      </div>
      {loading ? <p className="text-muted-foreground text-sm">Loading graph…</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {graph ? (
        <div className="glass-panel ghost-border flex-1 space-y-3 rounded-2xl border p-6">
          <h1 className="text-xl font-semibold">{graph.name}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{graph.nodes.length} nodes</Badge>
            <Badge variant="outline">{graph.edges.length} edges</Badge>
            <Badge variant="outline">entry: {graph.entry_node_id}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            The graph editor canvas lands in a later sub-phase of the studio consolidation. For
            now, use{" "}
            <code className="font-mono text-xs">apps/playground</code> to author and run this
            graph.
          </p>
        </div>
      ) : null}
    </div>
  );
}
