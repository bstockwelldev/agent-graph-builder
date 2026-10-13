"use client";

import Link from "next/link";
import { useState } from "react";
import type { GraphSummary } from "@bstockwelldev/agent-graph-sdk";

import { StudioConfirmDialog } from "@/components/studio/studio-confirm-dialog";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import {
  StudioCardDeleteIconButton,
  studioResourceCardInteractiveClass,
} from "@/components/studio/studio-resource-card-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGraphLibrary } from "@/hooks/use-graph-library";
import { cn } from "@/lib/utils";

export default function GraphsPage() {
  const library = useGraphLibrary();
  const { demos, ownGraphs, loading, loadError, actionError, setActionError, refetch } = library;
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GraphSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCreate() {
    setCreating(true);
    await library.create();
    setCreating(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await library.remove(deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
  }

  return (
    // `viewport` plus the inner `overflow-y-auto`: StudioShell clamps /graphs
    // to the viewport height, so the page has to scroll inside itself.
    <StudioPage viewport>
      <div className="shrink-0 space-y-4">
        <StudioPageHeader
          title="Graphs"
          description="Agent workflows compiled to LangGraph and run node-by-node."
          loading={loading}
          onRefresh={refetch}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="synth" disabled={creating} onClick={() => void handleCreate()}>
            New blank graph
          </Button>
        </div>
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-6" data-testid="graphs-scroll">
        {loadError && !loading ? (
          <div className="glass-panel ring-destructive/30 mb-4 space-y-2 rounded-lg p-4 ring-1" role="alert">
            <p className="text-destructive text-sm">{loadError}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : null}
        {actionError ? (
          <div className="glass-panel ring-destructive/30 mb-4 flex items-center gap-3 rounded-lg p-3 ring-1" role="alert">
            <p className="text-destructive flex-1 text-sm">{actionError}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setActionError(null)}>
              Dismiss
            </Button>
          </div>
        ) : null}
        {!loading && !loadError ? (
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
            <section aria-label="Your graphs">
              <h2 className="mb-4 text-sm font-semibold tracking-tight">Your graphs</h2>
              <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {ownGraphs.map((graph) => (
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
              {ownGraphs.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No graphs yet — create a blank one above, or open a demo and save your edits.
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </div>

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
