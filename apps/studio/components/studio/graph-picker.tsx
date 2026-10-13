"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { GraphSummary, SeededDemoSummary } from "@bstockwelldev/agent-graph-sdk";

import { StudioConfirmDialog } from "@/components/studio/studio-confirm-dialog";
import { StudioCardDeleteIconButton } from "@/components/studio/studio-resource-card-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGraphLibrary } from "@/hooks/use-graph-library";
import { clearLastGraph, readLastGraph, sortRecent } from "@/lib/lastGraph";
import { cn } from "@/lib/utils";

/**
 * The "Open graph" picker (canvas-first-landing-plan.md §3): a modal over the
 * canvas, as in Figma's file browser. One global dialog, rendered once by the
 * shell, opened from the header's graph switcher, ⌘O, the command palette, the
 * mobile tray, the empty canvas's button, or `?open=picker` in the URL.
 *
 * It is shadcn (a dialog reachable from the shell, apps/studio/AGENTS.md). It
 * uses a plain searchable list, not a cmdk listbox: each of your graphs has a
 * delete button, and a listbox option can't contain one.
 */
type GraphPickerContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const GraphPickerContext = createContext<GraphPickerContextValue | null>(null);

export function GraphPickerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // `?open=picker` (what /graphs will redirect to) opens it, then leaves the URL clean.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("open") !== "picker") return;
    url.searchParams.delete("open");
    window.history.replaceState(window.history.state, "", url);
    setIsOpen(true);
  }, []);

  // ⌘O / Ctrl+O toggles it, and replaces the browser's own "open file".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "o" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      event.preventDefault();
      setIsOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <GraphPickerContext.Provider value={value}>{children}</GraphPickerContext.Provider>;
}

export function useGraphPicker(): GraphPickerContextValue {
  const context = useContext(GraphPickerContext);
  if (!context) throw new Error("useGraphPicker must be used within a GraphPickerProvider");
  return context;
}

/** The picker, or null outside a provider (components that also render standalone, e.g. in unit tests). */
export function useOptionalGraphPicker(): GraphPickerContextValue | null {
  return useContext(GraphPickerContext);
}

const matches = (query: string, ...fields: (string | undefined)[]) =>
  !query || fields.some((field) => field?.toLowerCase().includes(query));

export function GraphPicker() {
  const picker = useGraphPicker();
  const router = useRouter();
  const pathname = usePathname();
  const library = useGraphLibrary({ lazy: true });
  const { demos, ownGraphs, loading, loadError, actionError, setActionError, refetch } = library;
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GraphSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fresh list on every opening: graphs are created and deleted elsewhere.
  useEffect(() => {
    if (picker.isOpen) void refetch();
    else setQuery("");
  }, [picker.isOpen, refetch]);

  const needle = query.trim().toLowerCase();
  const recent = useMemo(
    () => sortRecent(ownGraphs).filter((graph) => matches(needle, graph.name, graph.id)),
    [ownGraphs, needle],
  );
  const shownDemos = useMemo(
    () => demos.filter((demo) => matches(needle, demo.title, demo.tagline, demo.id)),
    [demos, needle],
  );

  const go = (graphId: string) => {
    picker.close();
    router.push(`/graphs/${encodeURIComponent(graphId)}`);
  };
  const firstMatch = recent[0]?.id ?? shownDemos[0]?.id ?? null;
  const currentGraphId = pathname?.match(/^\/graphs\/([^/]+)$/)?.[1] ?? null;

  async function handleCreate() {
    setCreating(true);
    const created = await library.create();
    setCreating(false);
    if (created) go(created.id);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    const deleted = await library.remove(target.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!deleted) return;
    if (readLastGraph() === target.id) clearLastGraph();
    // Deleting the graph that is open leaves nothing to show: back to the empty canvas.
    if (currentGraphId === decodeURIComponent(target.id)) {
      picker.close();
      router.push("/?open=picker");
    }
  }

  return (
    <>
      <Dialog open={picker.isOpen} onOpenChange={(next) => (next ? picker.open() : picker.close())}>
        <DialogContent className="sm:max-w-2xl" aria-describedby="graph-picker-description">
          <DialogHeader>
            <DialogTitle>Open graph</DialogTitle>
            <DialogDescription id="graph-picker-description">
              Pick one of your graphs or a demo, or start a blank graph.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              type="search"
              aria-label="Search graphs"
              placeholder="Find a graph…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && firstMatch) {
                  event.preventDefault();
                  go(firstMatch);
                }
              }}
            />
            <Button type="button" size="sm" variant="synth" className="shrink-0" disabled={creating} onClick={() => void handleCreate()}>
              New blank graph
            </Button>
          </div>
          {actionError ? (
            <div className="ring-destructive/30 flex items-center gap-3 rounded-lg p-3 ring-1" role="alert">
              <p className="text-destructive flex-1 text-sm">{actionError}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setActionError(null)}>
                Dismiss
              </Button>
            </div>
          ) : null}
          {/* Focusable so a long list can be scrolled from the keyboard. */}
          <div
            role="region"
            aria-label="Graphs"
            tabIndex={0}
            data-testid="picker-scroll"
            className="focus-visible:ring-primary/60 -mx-1 max-h-[55vh] min-h-24 space-y-6 overflow-y-auto px-1 focus-visible:ring-2 focus-visible:outline-none"
          >
            {loading ? <p className="text-muted-foreground text-sm">Loading graphs…</p> : null}
            {loadError && !loading ? (
              <div className="ring-destructive/30 space-y-2 rounded-lg p-3 ring-1" role="alert">
                <p className="text-destructive text-sm">{loadError}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
                  Try again
                </Button>
              </div>
            ) : null}
            {!loading && !loadError ? (
              <>
                <RecentSection graphs={recent} total={ownGraphs.length} currentGraphId={currentGraphId} deleting={deleting} onOpen={picker.close} onDelete={setDeleteTarget} />
                <DemosSection demos={shownDemos} currentGraphId={currentGraphId} onOpen={picker.close} />
                {recent.length === 0 && shownDemos.length === 0 && needle ? (
                  <p className="text-muted-foreground text-sm" role="status">
                    No graphs match “{query.trim()}”.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <StudioConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
        title="Delete graph"
        description={deleteTarget ? `Permanently remove "${deleteTarget.name}"? This cannot be undone.` : ""}
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}

const rowLinkClass =
  "hover:bg-muted focus-visible:ring-primary/60 flex min-w-0 flex-1 flex-col rounded-md px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:outline-none";

function RecentSection({
  graphs,
  total,
  currentGraphId,
  deleting,
  onOpen,
  onDelete,
}: {
  graphs: GraphSummary[];
  /** Your graphs before the search filter. */
  total: number;
  currentGraphId: string | null;
  deleting: boolean;
  onOpen: () => void;
  onDelete: (graph: GraphSummary) => void;
}) {
  if (graphs.length === 0 && total > 0) return null;
  return (
    <section aria-label="Recent graphs">
      <h3 className="mb-1 text-sm font-semibold tracking-tight">Recent</h3>
      {graphs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No graphs of your own yet. Start a blank one, or open a demo and save your edits.</p>
      ) : (
        <ul className="space-y-0.5">
          {graphs.map((graph) => (
            <li key={graph.id} className="flex items-center gap-1">
              <Link
                href={`/graphs/${encodeURIComponent(graph.id)}`}
                aria-current={graph.id === currentGraphId ? "page" : undefined}
                className={cn(rowLinkClass, graph.id === currentGraphId && "bg-muted")}
                onClick={onOpen}
              >
                <span className="truncate text-sm font-medium">{graph.name}</span>
                <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
                  <span className="truncate font-mono">{graph.id}</span>
                  <span className="shrink-0">{graph.node_count} nodes</span>
                </span>
              </Link>
              <StudioCardDeleteIconButton label={graph.name} disabled={deleting} onClick={() => onDelete(graph)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DemosSection({ demos, currentGraphId, onOpen }: { demos: SeededDemoSummary[]; currentGraphId: string | null; onOpen: () => void }) {
  if (demos.length === 0) return null;
  return (
    <section aria-label="Seeded demos">
      <h3 className="mb-1 text-sm font-semibold tracking-tight">Demos</h3>
      <p className="text-muted-foreground mb-1 px-2 text-xs">Read-only. Open one to run it; saving your edits forks it into your own copy.</p>
      <ul className="space-y-0.5">
        {demos.map((demo) => (
          <li key={demo.id}>
            <Link
              href={`/graphs/${encodeURIComponent(demo.id)}`}
              aria-current={demo.id === currentGraphId ? "page" : undefined}
              className={cn(rowLinkClass, "flex-none", demo.id === currentGraphId && "bg-muted")}
              onClick={onOpen}
            >
              <span className="text-sm font-medium">{demo.title}</span>
              <span className="text-muted-foreground text-xs">{demo.tagline}</span>
              <span className="flex flex-wrap gap-1 pt-1">
                {demo.node_types.map((nodeType) => (
                  <Badge key={nodeType} variant="outline">
                    {nodeType}
                  </Badge>
                ))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
