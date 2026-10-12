"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { GraphSummary, SeededDemoSummary } from "@bstockwelldev/agent-graph-sdk";
import { summarizeGraph } from "@bstockwelldev/agent-graph-sdk/graph";

import { client } from "@/lib/api-client";
import { StudioConfirmDialog } from "@/components/studio/studio-confirm-dialog";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import {
  StudioCardDeleteIconButton,
  studioCardEditHint,
  studioResourceCardInteractiveClass,
} from "@/components/studio/studio-resource-card-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function GraphsPage() {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [demos, setDemos] = useState<SeededDemoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GraphSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGraphs(await client.graphs.summaries.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // The gallery is additive: a demos failure never blocks the graph list.
    try {
      setDemos(await client.demos.list());
    } catch {
      setDemos([]);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function handleCreate(template: "blank" | "demo") {
    setCreating(true);
    try {
      const name = template === "demo" ? "Demo graph" : `New graph ${new Date().toLocaleTimeString()}`;
      const created = await client.graphs.create({ name, template });
      setGraphs((prev) => [summarizeGraph(created), ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await client.graphs.delete(deleteTarget.id);
      setGraphs((prev) => prev.filter((graph) => graph.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <StudioPage>
      <StudioPageHeader
        title="Graphs"
        description="Agent workflows compiled to LangGraph and run node-by-node."
        loading={loading}
        onRefresh={refetch}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="synth" disabled={creating} onClick={() => void handleCreate("blank")}>
          New blank graph
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={creating} onClick={() => void handleCreate("demo")}>
          New from demo template
        </Button>
      </div>
      {error && !loading ? (
        <div className="glass-panel ring-destructive/30 mb-4 space-y-2 rounded-lg p-4 ring-1" role="alert">
          <p className="text-destructive text-sm">{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {!loading && !error ? (
        <>
          {demos.length > 0 ? (
            <section aria-label="Seeded demos" className="mb-8">
              <h2 className="mb-1 text-sm font-semibold tracking-tight">Seeded demos</h2>
              <p className="text-muted-foreground mb-4 text-sm">
                Read-only gallery workflows. Open one to run it — saving your edits forks it into your own copy.
              </p>
              <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {demos.map((demo) => (
                  <li key={demo.id}>
                    <Card className={cn(studioResourceCardInteractiveClass, "p-0")}>
                      <Link href={`/graphs/${demo.id}`} className="block p-6">
                        <CardHeader className="p-0">
                          <CardTitle className="text-base">{demo.title}</CardTitle>
                          <CardDescription className="pt-1 text-sm">{demo.tagline}</CardDescription>
                          <div className="flex flex-wrap gap-1 pt-2">
                            {demo.node_types.map((nodeType) => (
                              <Badge key={nodeType} variant="outline">
                                {nodeType}
                              </Badge>
                            ))}
                          </div>
                        </CardHeader>
                      </Link>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {graphs.map((graph) => (
              <li key={graph.id}>
                <Card className={cn(studioResourceCardInteractiveClass, "p-0")}>
                  <Link href={`/graphs/${graph.id}`} className="block p-6">
                    <CardHeader className="p-0">
                      <CardTitle className="text-base">{graph.name}</CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-2 font-mono text-xs">
                        {graph.id}
                        <Badge variant="outline">{graph.node_count} nodes</Badge>
                        <Badge variant="outline">{graph.edge_count} edges</Badge>
                      </CardDescription>
                      <p className="text-muted-foreground pt-1 text-[11px]">{studioCardEditHint}</p>
                    </CardHeader>
                  </Link>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-1">
                      <StudioCardDeleteIconButton
                        label={graph.name}
                        disabled={deleting}
                        onClick={() => setDeleteTarget(graph)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {graphs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No graphs yet — create one above.</p>
          ) : null}
        </>
      ) : null}

      <StudioConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete graph"
        description={deleteTarget ? `Permanently remove "${deleteTarget.name}"? This cannot be undone.` : ""}
        loading={deleting}
        onConfirm={handleDelete}
      />
    </StudioPage>
  );
}
