"use client";

import { useEffect, useState } from "react";
import type { AnalyticsDashboardPayload } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Studio-consolidation Phase 5 (docs/planning/features/studio-consolidation-plan.md):
// the full port Phase 4c deferred — totals, a daily trend, and a per-graph
// breakdown, backed by GET /api/analytics (backend/app/analytics.py).
// Token counts / spend are estimates (chars/4 heuristic — AGB's ChatModel
// protocol has no real usage data), not billing truth; see analytics.py's
// module docstring for why.
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

export default function AnalyticsPage() {
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
    <StudioPage>
      <StudioPageHeader
        title="Analytics"
        description="Run totals, a daily trend, and per-graph spend across every graph. Token counts and spend are rough estimates, not billing truth."
        loading={loading}
      />
      {error && !loading ? <p className="text-destructive text-sm">{error}</p> : null}

      {totals ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ["Invocations", totals.invocations.toLocaleString()],
                ["Total tokens (est.)", totals.total_tokens.toLocaleString()],
                ["Estimated spend", USD_FORMATTER.format(totals.estimated_usd)],
                ["Avg. duration", formatDuration(totals.avg_duration_ms)],
                [
                  "Input / output tokens",
                  `${totals.input_tokens.toLocaleString()} / ${totals.output_tokens.toLocaleString()}`,
                ],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Daily trend</CardTitle>
            </CardHeader>
            <CardContent>
              {payload && payload.daily.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                        <th className="py-2 pr-4 font-normal">Date</th>
                        <th className="py-2 pr-4 font-normal">Invocations</th>
                        <th className="py-2 pr-4 font-normal">Tokens</th>
                        <th className="py-2 font-normal">Est. spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.daily.map((point) => (
                        <tr key={point.date} className="border-b last:border-0">
                          <td className="py-2 pr-4">{point.date}</td>
                          <td className="py-2 pr-4">{point.invocations.toLocaleString()}</td>
                          <td className="py-2 pr-4">{point.tokens.toLocaleString()}</td>
                          <td className="py-2">{USD_FORMATTER.format(point.estimated_usd)}</td>
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
              <CardTitle>By graph</CardTitle>
            </CardHeader>
            <CardContent>
              {payload && payload.by_graph.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                        <th className="py-2 pr-4 font-normal">Graph</th>
                        <th className="py-2 pr-4 font-normal">Invocations</th>
                        <th className="py-2 pr-4 font-normal">Tokens</th>
                        <th className="py-2 font-normal">Est. spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.by_graph.map((row) => (
                        <tr key={row.graph_id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{row.name}</td>
                          <td className="py-2 pr-4">{row.invocations.toLocaleString()}</td>
                          <td className="py-2 pr-4">{row.tokens.toLocaleString()}</td>
                          <td className="py-2">{USD_FORMATTER.format(row.estimated_usd)}</td>
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
    </StudioPage>
  );
}
