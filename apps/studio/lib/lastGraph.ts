/**
 * The graph the studio reopens on `/` (canvas-first-landing-plan.md §3).
 * `GraphEditor` writes it whenever a graph loads. Storage can be missing or
 * throw (private windows, blocked site data), so every access is guarded and
 * a failure just means "no last graph".
 */
export const LAST_GRAPH_KEY = "agb:last-graph";

export function readLastGraph(): string | null {
  try {
    return window.localStorage.getItem(LAST_GRAPH_KEY) || null;
  } catch {
    return null;
  }
}

export function writeLastGraph(graphId: string): void {
  try {
    window.localStorage.setItem(LAST_GRAPH_KEY, graphId);
  } catch {
    // Reopening the last graph is a convenience; `/` falls back to the picker.
  }
}

export function clearLastGraph(): void {
  try {
    window.localStorage.removeItem(LAST_GRAPH_KEY);
  } catch {
    // Same as above.
  }
}

/** Newest first by `updated_at`; graphs without one go last, in their given order. */
export function sortRecent<T extends { updated_at?: string | null }>(graphs: readonly T[]): T[] {
  return [...graphs].sort((a, b) => {
    if (a.updated_at && b.updated_at) return b.updated_at.localeCompare(a.updated_at);
    if (a.updated_at) return -1;
    if (b.updated_at) return 1;
    return 0;
  });
}
