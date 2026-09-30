import type { AnalyticsDailyPoint, AnalyticsLatencyBucket, AnalyticsModelRow } from "@bstockwelldev/agent-graph-sdk";

// Row builders for the Analytics page's GenUI charts (resource-forms-
// consistency-plan.md, slice 5 follow-up): runs by status, the run duration
// distribution and the provider/model mix. Pure, so they're unit-tested
// without rendering a chart.

type Row = Record<string, string | number>;

/** Known statuses first, in lifecycle-outcome order; anything else after, alphabetically. */
const STATUS_ORDER = ["succeeded", "failed", "paused", "running", "queued"];

function statusRank(status: string): number {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
}

/** One row per day with a column per status seen in the window (0 where absent). */
export function statusByDay(daily: AnalyticsDailyPoint[]): { rows: Row[]; statuses: string[] } {
  const seen = new Set(daily.flatMap((point) => Object.keys(point.by_status ?? {})));
  const statuses = [...seen].sort((a, b) => statusRank(a) - statusRank(b) || a.localeCompare(b));
  const rows = daily.map((point) => {
    const row: Row = { day: point.date.slice(5) };
    for (const status of statuses) row[status] = point.by_status?.[status] ?? 0;
    return row;
  });
  return { rows, statuses };
}

export function latencyRows(latency: AnalyticsLatencyBucket[]): Row[] {
  return latency.map((bucket) => ({ duration: bucket.label, runs: bucket.runs }));
}

/** "provider/model" labels, keeping the order the API ranked them in (most calls first). */
export function modelRows(models: AnalyticsModelRow[]): Row[] {
  return models.map((row) => ({ model: `${row.provider}/${row.model}`, calls: row.calls }));
}
