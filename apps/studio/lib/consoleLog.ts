import { useSyncExternalStore } from "react";

/**
 * App-wide console/log drawer (studio-config-editor-and-console-plan.md
 * §7): a small module-level store any component can push into
 * (`logConsoleEntry`) and the global `ConsolePanel` subscribes to
 * (`useConsoleLog`). This is what gives client-side errors — currently
 * only visible in the browser devtools console — somewhere a non-developer
 * user can actually see them, and what lets the panel mirror live run
 * events without GraphEditor.tsx and the panel needing to share a React
 * tree (they don't — the panel is a global workbench panel, the graph
 * editor is route-scoped).
 */

export type ConsoleSeverity = "info" | "warning" | "error";

export interface ConsoleEntry {
  id: string;
  timestamp: string;
  severity: ConsoleSeverity;
  /** Free-text origin shown next to the message, e.g. "Provider", "Run", "Validation". */
  source: string;
  message: string;
  graphId?: string;
  nodeId?: string;
  runId?: string;
}

const MAX_ENTRIES = 300;

let entries: ConsoleEntry[] = [];
let lastViewedAt = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

let nextId = 0;

export function logConsoleEntry(entry: Omit<ConsoleEntry, "id" | "timestamp"> & { timestamp?: string }): void {
  nextId += 1;
  const full: ConsoleEntry = {
    id: `console-${nextId}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    severity: entry.severity,
    source: entry.source,
    message: entry.message,
    graphId: entry.graphId,
    nodeId: entry.nodeId,
    runId: entry.runId,
  };
  entries = entries.length >= MAX_ENTRIES ? [...entries.slice(1), full] : [...entries, full];
  notify();
}

export function markConsoleViewed(): void {
  lastViewedAt = Date.now();
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getEntriesSnapshot(): ConsoleEntry[] {
  return entries;
}

// Must be a stable reference: a fresh `[]` per call made React warn "The
// result of getServerSnapshot should be cached to avoid an infinite loop"
// (surfaced as the Next.js dev "1 Issue" badge on every page).
const EMPTY_ENTRIES: ConsoleEntry[] = [];

function getServerEntriesSnapshot(): ConsoleEntry[] {
  return EMPTY_ENTRIES;
}

export function useConsoleLog(): ConsoleEntry[] {
  return useSyncExternalStore(subscribe, getEntriesSnapshot, getServerEntriesSnapshot);
}

/** Unread error/warning counts since the panel was last opened — the HUD
 * "badge." Command-palette-driven (see CommandPalette.tsx) since this
 * repo's global panels have no persistent icon-button row to attach a
 * literal badge dot to; every other global panel (Chat, Analytics, the
 * resource browsers) is reached the same "hotkey + palette" way. */
export function unreadSeverityCounts(allEntries: ConsoleEntry[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const entry of allEntries) {
    if (new Date(entry.timestamp).getTime() <= lastViewedAt) continue;
    if (entry.severity === "error") errors += 1;
    else if (entry.severity === "warning") warnings += 1;
  }
  return { errors, warnings };
}

export function useConsoleUnreadCounts(): { errors: number; warnings: number } {
  const allEntries = useConsoleLog();
  return unreadSeverityCounts(allEntries);
}

// --- Canvas focus bridge -----------------------------------------------
// A console entry tied to a node can be clicked from any route. If the
// user is already on that graph, GraphEditor.tsx picks the request up on
// its next render (via consumeCanvasFocus) and reuses the same focusNode()
// mechanism diagnostics/waterfall clicks already use; otherwise the click
// navigates to the graph first (see ConsolePanel.tsx), and the same
// pending request is consumed once that graph mounts.

let pendingFocus: { graphId: string; nodeId: string } | null = null;

export function requestCanvasFocus(graphId: string, nodeId: string): void {
  pendingFocus = { graphId, nodeId };
}

export function consumeCanvasFocus(graphId: string): string | null {
  if (pendingFocus && pendingFocus.graphId === graphId) {
    const { nodeId } = pendingFocus;
    pendingFocus = null;
    return nodeId;
  }
  return null;
}

/** Maps a run SSE event to a console severity/message — used to mirror
 * live run events (GraphEditor.tsx's `onEvent` handler) into the Run
 * events tab without duplicating RunPanel's own "Event log" section. */
export function describePlatformEvent(event: {
  event_type: string;
  node_id?: string | null;
  payload: Record<string, unknown>;
}): { severity: ConsoleSeverity; message: string } {
  const suffix = event.node_id ? ` · ${event.node_id}` : "";
  if (event.event_type.endsWith(".failed")) {
    const errorText = typeof event.payload.error === "string" ? `: ${event.payload.error}` : "";
    return { severity: "error", message: `${event.event_type}${suffix}${errorText}` };
  }
  if (event.event_type.endsWith(".paused")) {
    return { severity: "warning", message: `${event.event_type}${suffix}` };
  }
  return { severity: "info", message: `${event.event_type}${suffix}` };
}

/** Test-only reset for this module's singleton state. */
export function __resetConsoleLogForTests(): void {
  entries = [];
  lastViewedAt = 0;
  nextId = 0;
  pendingFocus = null;
}
