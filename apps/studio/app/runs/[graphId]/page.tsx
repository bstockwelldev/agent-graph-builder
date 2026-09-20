"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { RunGraphSnapshot, RunSummary } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_VARIANT: Record<RunSummary["status"], string> = {
  succeeded: "text-emerald-400",
  failed: "text-destructive",
  paused: "text-amber-400",
  running: "text-primary",
  queued: "text-muted-foreground",
};

// P0 graph foundation, Slice D (docs/planning/features/p0-graph-foundation-design-plan.md,
// "Version-pinned runs and Studio UX" item 5): "Run history: labels the
// release or draft snapshot used; opening it presents the exact snapshot in
// read-only inspection mode." A compact dialog rather than a second canvas —
// per this same document's own "no permanent validation modal, separate
// node editor, or second canvas" guidance.
function SnapshotDialog({ runId, onOpenChange }: { runId: string | null; onOpenChange: (open: boolean) => void }) {
  const [snapshot, setSnapshot] = useState<RunGraphSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSnapshot(null);
    client
      .getRunGraphSnapshot(runId)
      .then((loaded) => {
        if (!cancelled) setSnapshot(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return (
    <Dialog open={runId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Run graph snapshot</DialogTitle>
          <DialogDescription>
            The exact graph this run started from, independent of later draft edits.
          </DialogDescription>
        </DialogHeader>
        {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {snapshot ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={snapshot.source === "release" ? "default" : "outline"}>
                {snapshot.source === "release" ? "Release" : "Draft snapshot"}
              </Badge>
            </div>
            <p className="text-muted-foreground font-mono text-xs break-all">
              fingerprint: {snapshot.graph_fingerprint}
            </p>
            {snapshot.release_id ? (
              <p className="text-muted-foreground font-mono text-xs break-all">
                release: {snapshot.release_id}
              </p>
            ) : null}
            {snapshot.graph ? (
              <div className="space-y-1">
                <p>
                  <span className="text-muted-foreground">Graph: </span>
                  {snapshot.graph.name}
                </p>
                <p>
                  <span className="text-muted-foreground">Nodes: </span>
                  {snapshot.graph.nodes.length}
                  <span className="text-muted-foreground"> · Edges: </span>
                  {snapshot.graph.edges.length}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                Release-sourced — the full graph and its resolved resource bindings are stored on the release
                itself, not duplicated here.
              </p>
            )}
            {snapshot.resource_snapshots ? (
              <p>
                <span className="text-muted-foreground">Resources embedded: </span>
                {Object.keys(snapshot.resource_snapshots).length}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Captured: {new Date(snapshot.created_at).toLocaleString()}
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function GraphRunsPage({ params }: { params: Promise<{ graphId: string }> }) {
  const { graphId } = use(params);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotRunId, setSnapshotRunId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client
      .listRuns(graphId)
      .then((loaded) => {
        if (!cancelled) setRuns(loaded);
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
  }, [graphId]);

  const closeSnapshot = useCallback((open: boolean) => {
    if (!open) setSnapshotRunId(null);
  }, []);

  return (
    <StudioPage>
      <Link
        href="/runs"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-2 w-fit" })}
      >
        &larr; Runs
      </Link>
      <StudioPageHeader
        title="Run history"
        description={<span className="font-mono text-xs">{graphId}</span>}
        loading={loading}
      />
      {error && !loading ? <p className="text-destructive text-sm">{error}</p> : null}
      {!loading && !error ? (
        <>
          <ul className="space-y-3">
            {runs.map((run) => (
              <li key={run.run_id}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-mono text-sm">{run.run_id}</CardTitle>
                      <Badge variant="outline" className={STATUS_VARIANT[run.status]}>
                        {run.status}
                      </Badge>
                      {run.provider ? <Badge variant="outline">{run.provider}</Badge> : null}
                      {/* P0 graph foundation, Slice D: "Run history: labels
                          the release or draft snapshot used." */}
                      {run.source ? (
                        <Badge variant={run.source === "release" ? "default" : "outline"}>
                          {run.source === "release" ? "Release" : "Draft snapshot"}
                        </Badge>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => setSnapshotRunId(run.run_id)}
                      >
                        View snapshot
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="text-muted-foreground space-y-1 text-xs">
                    {run.started_at ? <p>Started: {run.started_at}</p> : null}
                    {run.completed_at ? <p>Completed: {run.completed_at}</p> : null}
                    {run.error ? <p className="text-destructive">{run.error}</p> : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          {runs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No runs for this graph yet.</p>
          ) : null}
        </>
      ) : null}
      <SnapshotDialog runId={snapshotRunId} onOpenChange={closeSnapshot} />
    </StudioPage>
  );
}
