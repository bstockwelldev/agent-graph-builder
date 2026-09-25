import type { NodeTrace, RunSummary } from "@bstockwelldev/agent-graph-sdk";
import { isTerminalRunStatus } from "./watchRun";

// Stub-provider runs are offline demos: they live in this browser's
// localStorage so they can be re-inspected even when the server can't
// return them (another isolate, a pre-Supabase run, backend offline).
export const RUN_CACHE_STORAGE_KEY = "agb:runCache:v1";
export const RUN_CACHE_LIMIT = 50;

export type CachedRun = { summary: RunSummary; traces: NodeTrace[]; cachedAt: string };

function readAll(): CachedRun[] {
  try {
    const raw = window.localStorage.getItem(RUN_CACHE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CachedRun[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: CachedRun[]) {
  // On a quota error, drop the oldest entries until it fits (or nothing is left).
  for (let kept = entries; kept.length > 0; kept = kept.slice(0, -1)) {
    try {
      window.localStorage.setItem(RUN_CACHE_STORAGE_KEY, JSON.stringify(kept));
      return;
    } catch {
      // Retry with fewer entries.
    }
  }
}

export function isCacheableRun(summary: RunSummary): boolean {
  return summary.provider === "stub" && isTerminalRunStatus(summary.status);
}

export function cacheRun(summary: RunSummary, traces: NodeTrace[]): void {
  if (!isCacheableRun(summary)) return;
  const others = readAll().filter((entry) => entry.summary.run_id !== summary.run_id);
  writeAll([{ summary, traces, cachedAt: new Date().toISOString() }, ...others].slice(0, RUN_CACHE_LIMIT));
}

export function getCachedRun(runId: string): CachedRun | null {
  return readAll().find((entry) => entry.summary.run_id === runId) ?? null;
}

export function listCachedRuns(graphId: string): RunSummary[] {
  return readAll()
    .filter((entry) => entry.summary.graph_id === graphId)
    .map((entry) => entry.summary);
}

/** Server history plus cached runs it doesn't know about, newest first. */
export function mergeRunHistory(serverRuns: RunSummary[], cachedRuns: RunSummary[]): RunSummary[] {
  const known = new Set(serverRuns.map((run) => run.run_id));
  const merged = [...serverRuns, ...cachedRuns.filter((run) => !known.has(run.run_id))];
  return merged.sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
}
