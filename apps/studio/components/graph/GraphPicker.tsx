"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";
import type { GraphSummary, SeededDemoSummary } from "@bstockwelldev/agent-graph-sdk";

import { useGraphLibrary } from "@/hooks/use-graph-library";
import { accentSurface, border, fontFamily, localType, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { clearLastGraph, readLastGraph, sortRecent } from "@/lib/lastGraph";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { TextInput } from "./ui/fields";
import { IconButton } from "./ui/IconButton";
import { Modal } from "./ui/Modal";

/**
 * The "Open graph" picker (canvas-first-landing-plan.md §3): a modal over the
 * canvas, as in Figma's file browser. One global dialog, rendered once by the
 * shell, opened from the header's graph switcher, ⌘O, the command palette, the
 * mobile tray, the empty canvas's button, or `?open=picker` in the URL.
 *
 * It is styled from the canvas's own tokens (lib/graph-theme.ts and the graph
 * UI kit), not shadcn: it is how you choose what goes on the canvas, so it
 * should look like the canvas, not like the CRUD pages it replaced. It is a
 * plain searchable list rather than a cmdk listbox, because each of your
 * graphs has a delete button and a listbox option can't contain one.
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

  // `?open=picker` (what /graphs redirects to) opens it, then leaves the URL clean.
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

// ---- Styles (canvas tokens) --------------------------------------------

const eyebrow: CSSProperties = { ...localType.label, color: text.secondary, margin: `0 0 ${spacing[1]}px`, padding: `0 ${spacing[3]}px` };
const caption: CSSProperties = { ...typeScale.caption, color: text.secondary };
const rowLink: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
  flex: 1,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderRadius: radius.lg,
  color: text.primary,
  textDecoration: "none",
  ...localType.ui,
};
const alertBox: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[3],
  padding: spacing[3],
  borderRadius: radius.lg,
  border: `1px solid ${accentSurface.destructive.border}`,
  background: accentSurface.destructive.bg,
  color: accentSurface.destructive.text,
  ...localType.ui,
};

export function GraphPicker() {
  const picker = useGraphPicker();
  const router = useRouter();
  const pathname = usePathname();
  const library = useGraphLibrary({ lazy: true });
  const { demos, ownGraphs, loading, loadError, actionError, setActionError, refetch } = library;
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // Delete asks inline, in the row, before it removes anything.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fresh list on every opening: graphs are created and deleted elsewhere.
  useEffect(() => {
    if (picker.isOpen) void refetch();
    else {
      setQuery("");
      setConfirmId(null);
    }
  }, [picker.isOpen, refetch]);

  const needle = query.trim().toLowerCase();
  const recent = useMemo(() => sortRecent(ownGraphs).filter((graph) => matches(needle, graph.name, graph.id)), [ownGraphs, needle]);
  const shownDemos = useMemo(() => demos.filter((demo) => matches(needle, demo.title, demo.tagline, demo.id)), [demos, needle]);

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

  async function handleDelete(target: GraphSummary) {
    setDeleting(true);
    const deleted = await library.remove(target.id);
    setDeleting(false);
    setConfirmId(null);
    if (!deleted) return;
    if (readLastGraph() === target.id) clearLastGraph();
    // Deleting the graph that is open leaves nothing to show: back to the empty canvas.
    if (currentGraphId === decodeURIComponent(target.id)) {
      picker.close();
      router.push("/?open=picker");
    }
  }

  return (
    <Modal open={picker.isOpen} onClose={picker.close} label="Open graph" width={680}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: spacing[3], padding: `${spacing[4]}px ${spacing[4]}px ${spacing[3]}px` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, ...typeScale.subheading, fontSize: 16, lineHeight: "24px", fontWeight: 600 }}>Open graph</h2>
          <p style={{ margin: "2px 0 0", ...caption }}>Pick one of your graphs or a demo, or start a blank graph.</p>
        </div>
        <IconButton label="Close" icon={<X size={16} aria-hidden="true" />} onClick={picker.close} />
      </div>

      <div style={{ display: "flex", gap: spacing[2], padding: `0 ${spacing[4]}px ${spacing[3]}px` }}>
        <TextInput
          type="search"
          aria-label="Search graphs"
          placeholder="Find a graph…"
          // Off: the browser's own history of past entries would float over the list.
          autoComplete="off"
          spellCheck={false}
          data-autofocus=""
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && firstMatch) {
              event.preventDefault();
              go(firstMatch);
            }
          }}
        />
        <Button variant="primary" disabled={creating} onClick={() => void handleCreate()} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
          New blank graph
        </Button>
      </div>

      {actionError ? (
        <div role="alert" style={{ ...alertBox, margin: `0 ${spacing[4]}px ${spacing[3]}px` }}>
          <span style={{ flex: 1 }}>{actionError}</span>
          <Button onClick={() => setActionError(null)}>Dismiss</Button>
        </div>
      ) : null}

      {/* Focusable so a long list can be scrolled from the keyboard. */}
      <div
        role="region"
        aria-label="Graphs"
        tabIndex={0}
        data-testid="picker-scroll"
        className="agb-focus-ring"
        style={{
          flex: 1,
          minHeight: 96,
          overflowY: "auto",
          padding: `${spacing[1]}px ${spacing[2]}px ${spacing[4]}px`,
          borderTop: `1px solid ${border.subtle}`,
          display: "flex",
          flexDirection: "column",
          gap: spacing[4],
        }}
      >
        {loading ? <p style={{ margin: `${spacing[3]}px ${spacing[3]}px 0`, ...caption }}>Loading graphs…</p> : null}
        {loadError && !loading ? (
          <div role="alert" style={{ ...alertBox, marginTop: spacing[3] }}>
            <span style={{ flex: 1 }}>{loadError}</span>
            <Button onClick={() => void refetch()}>Try again</Button>
          </div>
        ) : null}
        {!loading && !loadError ? (
          <>
            <RecentSection
              graphs={recent}
              total={ownGraphs.length}
              currentGraphId={currentGraphId}
              confirmId={confirmId}
              deleting={deleting}
              onOpen={picker.close}
              onAskDelete={setConfirmId}
              onDelete={(graph) => void handleDelete(graph)}
            />
            <DemosSection demos={shownDemos} currentGraphId={currentGraphId} onOpen={picker.close} />
            {recent.length === 0 && shownDemos.length === 0 && needle ? (
              <p role="status" style={{ margin: `0 ${spacing[3]}px`, ...caption }}>
                No graphs match “{query.trim()}”.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function RecentSection({
  graphs,
  total,
  currentGraphId,
  confirmId,
  deleting,
  onOpen,
  onAskDelete,
  onDelete,
}: {
  graphs: GraphSummary[];
  /** Your graphs before the search filter. */
  total: number;
  currentGraphId: string | null;
  confirmId: string | null;
  deleting: boolean;
  onOpen: () => void;
  onAskDelete: (graphId: string | null) => void;
  onDelete: (graph: GraphSummary) => void;
}) {
  if (graphs.length === 0 && total > 0) return null;
  return (
    <section aria-label="Recent graphs" style={{ paddingTop: spacing[3] }}>
      <h3 style={eyebrow}>Recent</h3>
      {graphs.length === 0 ? (
        <p style={{ margin: `0 ${spacing[3]}px`, ...caption }}>No graphs of your own yet. Start a blank one, or open a demo and save your edits.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {graphs.map((graph) => {
            const current = graph.id === currentGraphId;
            const asking = confirmId === graph.id;
            return (
              <li key={graph.id} style={{ display: "flex", alignItems: "center", gap: spacing[1], borderRadius: radius.lg, background: current ? surface.raised : "transparent" }}>
                {asking ? (
                  <>
                    <span style={{ flex: 1, minWidth: 0, padding: `${spacing[2]}px ${spacing[3]}px`, ...localType.ui }}>
                      Delete “{graph.name}”? This can’t be undone.
                    </span>
                    <Button variant="destructive" disabled={deleting} onClick={() => onDelete(graph)} aria-label={`Confirm delete ${graph.name}`}>
                      Delete
                    </Button>
                    <Button disabled={deleting} onClick={() => onAskDelete(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/graphs/${encodeURIComponent(graph.id)}`}
                      aria-current={current ? "page" : undefined}
                      className="agb-focus-ring agb-hoverable"
                      style={rowLink}
                      onClick={onOpen}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{graph.name}</span>
                      <span style={{ ...caption, display: "flex", gap: spacing[2], minWidth: 0 }}>
                        <span style={{ fontFamily: fontFamily.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{graph.id}</span>
                        <span style={{ flexShrink: 0 }}>{graph.node_count} nodes</span>
                      </span>
                    </Link>
                    <IconButton
                      label={`Delete ${graph.name}`}
                      icon={<Trash2 size={15} aria-hidden="true" />}
                      tone="destructive"
                      disabled={deleting}
                      onClick={() => onAskDelete(graph.id)}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DemosSection({ demos, currentGraphId, onOpen }: { demos: SeededDemoSummary[]; currentGraphId: string | null; onOpen: () => void }) {
  if (demos.length === 0) return null;
  return (
    <section aria-label="Seeded demos">
      <h3 style={eyebrow}>Demos</h3>
      <p style={{ margin: `0 ${spacing[3]}px ${spacing[1]}px`, ...caption }}>
        Read-only. Open one to run it; saving your edits forks it into your own copy.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {demos.map((demo) => {
          const current = demo.id === currentGraphId;
          return (
            <li key={demo.id}>
              <Link
                href={`/graphs/${encodeURIComponent(demo.id)}`}
                aria-current={current ? "page" : undefined}
                className="agb-focus-ring agb-hoverable"
                style={{ ...rowLink, flex: "none", gap: 4, background: current ? surface.raised : "transparent" }}
                onClick={onOpen}
              >
                <span style={{ fontWeight: 600 }}>{demo.title}</span>
                <span style={caption}>{demo.tagline}</span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: spacing[1], paddingTop: 2 }}>
                  {demo.node_types.map((nodeType) => (
                    <Chip key={nodeType}>{nodeType}</Chip>
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
