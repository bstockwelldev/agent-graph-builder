"use client";

import { useEffect, useState } from "react";
import type { AnalyticsDashboardPayload } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Phase 10 Slice A (docs/planning/features/studio-shell-ux-gap-analysis.md):
 * the same dashboard body as `app/analytics/page.tsx`, ported into a HUD
 * panel so it's reachable via Cmd/Ctrl+K without leaving the canvas — the
 * gap analysis's Tier 1 finding that /analytics had no HUD door at all.
 * Global scope, not graph-scoped: `client.getAnalytics()` spans every
 * graph in the workspace. Token counts / spend are estimates (chars/4
 * heuristic — AGB's ChatModel protocol has no real usage data), not
 * billing truth; see backend/app/analytics.py's module docstring.
 */
const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function AnalyticsPanel() {
  const [payload, setPayload] = useState<AnalyticsDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const dashboard = await client.getAnalytics();
        if (!cancelled) setPayload(dashboard);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = payload?.totals;

  return (
    <div className="space-y-4 p-3">
      <div>
        <h2 className="text-sm font-semibold">Analytics</h2>
        <p className="text-muted-foreground text-xs">
          Run totals, a daily trend, and per-graph spend across every graph. Estimates, not billing truth.
        </p>
      </div>
      {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
      {error && !loading ? <p className="text-destructive text-sm">{error}</p> : null}

      {totals ? (
        <>
          <section className="grid grid-cols-2 gap-3">
            {(
              [
                ["Invocations", totals.invocations.toLocaleString()],
                ["Total tokens (est.)", totals.total_tokens.toLocaleString()],
                ["Estimated spend", USD_FORMATTER.format(totals.estimated_usd)],
                ["Avg. duration", formatDuration(totals.avg_duration_ms)],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Daily trend</CardTitle>
            </CardHeader>
            <CardContent>
              {payload && payload.daily.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left uppercase tracking-wide">
                        <th className="py-1 pr-2 font-normal">Date</th>
                        <th className="py-1 pr-2 font-normal">Runs</th>
                        <th className="py-1 font-normal">Est. spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.daily.map((point) => (
                        <tr key={point.date} className="border-b last:border-0">
                          <td className="py-1 pr-2">{point.date}</td>
                          <td className="py-1 pr-2">{point.invocations.toLocaleString()}</td>
                          <td className="py-1">{USD_FORMATTER.format(point.estimated_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No runs yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">By graph</CardTitle>
            </CardHeader>
            <CardContent>
              {payload && payload.by_graph.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left uppercase tracking-wide">
                        <th className="py-1 pr-2 font-normal">Graph</th>
                        <th className="py-1 pr-2 font-normal">Runs</th>
                        <th className="py-1 font-normal">Est. spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.by_graph.map((row) => (
                        <tr key={row.graph_id} className="border-b last:border-0">
                          <td className="py-1 pr-2">{row.name}</td>
                          <td className="py-1 pr-2">{row.invocations.toLocaleString()}</td>
                          <td className="py-1">{USD_FORMATTER.format(row.estimated_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No runs yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
