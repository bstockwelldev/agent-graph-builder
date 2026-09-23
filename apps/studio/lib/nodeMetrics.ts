import type { NodeMetrics } from "@bstockwelldev/agent-graph-sdk";

/**
 * Display helpers for graph/node-scoped analytics
 * (studio-graph-workbench-redesign-plan.md, Wave 2). Aggregation itself is
 * backend-owned (backend/app/node_analytics.py) -- these only format.
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

/** "Needs attention" when a node fails at least a fifth of the time. */
export function isUnhealthy(metrics: Pick<NodeMetrics, "success_rate" | "failed">): boolean {
  return metrics.failed > 0 && metrics.success_rate !== null && metrics.success_rate < 0.8;
}

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
