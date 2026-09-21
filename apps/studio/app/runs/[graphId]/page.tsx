"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { RunGraphSnapshot, RunSummary } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

// Phase 10 Slice D ("operational data grids for registries/run history" --
// docs/planning/features/studio-shell-ux-gap-analysis.md). Run history is
// genuinely tabular (timestamps, statuses, one row per run), so a sortable
// table is a real upgrade here -- unlike the five resource registries
// (agents/prompts/tools/mcp/llm-profiles), whose entries are named,
// described things better suited to their existing card layout. Converting
// those into grids too is a larger, separate design decision, not made
// here.
type SortKey = "started_at" | "status";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead>
      <button
        type="button"
        className={cn(
          "flex items-center gap-1 text-xs font-medium",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className="size-3" aria-hidden />
      </button>
    </TableHead>
  );
}

export default function GraphRunsPage({ params }: { params: Promise<{ graphId: string }> }) {
  const { graphId } = use(params);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotRunId, setSnapshotRunId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("started_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((current) => {
      if (current === key) {
        setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
        return current;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  const sortedRuns = useMemo(() => {
    const copy = [...runs];
    copy.sort((a, b) => {
      const cmp =
        sortKey === "status"
          ? a.status.localeCompare(b.status)
          : (a.started_at ?? "").localeCompare(b.started_at ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [runs, sortKey, sortDir]);

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
        runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No runs for this graph yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <SortHeader label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <TableHead>Source</TableHead>
                <TableHead>Provider</TableHead>
                <SortHeader
                  label="Started"
                  sortKey="started_at"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <TableHead>Completed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRuns.map((run) => (
                <TableRow key={run.run_id}>
                  <TableCell className="max-w-40 truncate font-mono text-xs" title={run.run_id}>
                    {run.run_id}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_VARIANT[run.status]}>
                      {run.status}
                    </Badge>
                    {run.error ? (
                      <p className="text-destructive mt-1 max-w-48 truncate text-xs" title={run.error}>
                        {run.error}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {run.source ? (
                      <Badge variant={run.source === "release" ? "default" : "outline"}>
                        {run.source === "release" ? "Release" : "Draft snapshot"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{run.provider ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{run.started_at ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{run.completed_at ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSnapshotRunId(run.run_id)}>
                      View snapshot
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      ) : null}
      <SnapshotDialog runId={snapshotRunId} onOpenChange={closeSnapshot} />
    </StudioPage>
  );
}
