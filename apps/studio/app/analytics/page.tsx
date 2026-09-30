"use client";

import { useEffect, useState } from "react";
import type { AnalyticsDashboardPayload } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { ScopeSelect } from "@/components/studio/scope-select";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenuiChart } from "@/components/graph/ui/genui/GenuiChart";
import { GraphAnalyticsView } from "@/components/workbench/panels/AnalyticsPanel";
import { useGraphScope } from "@/hooks/use-graph-scope";
import { latencyRows, modelRows, statusByDay } from "@/lib/analyticsCharts";

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
  const scope = useGraphScope();
  const graphId = scope.graphId;
  const [payload, setPayload] = useState<AnalyticsDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for the scope, so a graph-scoped link doesn't flash the workspace.
    if (!scope.ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    async function load() {
      try {
        const dashboard = await client.analytics.dashboard(graphId ? { graphId } : {});
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
  }, [graphId, scope.ready]);

  const totals = payload?.totals;
  const graph = scope.graph;
  const byStatus = payload ? statusByDay(payload.daily) : null;

  return (
    <StudioPage>
      <StudioPageHeader
        title="Analytics"
        description={
          graph
            ? `${graph.name}: success rate, latency and per-node metrics over its recent runs, plus runs by status, run durations and model calls over the last 30 days. Token counts and spend are rough estimates, not billing truth.`
            : "Run totals, runs by status, run durations, model calls and per-graph spend across every graph over the last 30 days. Token counts and spend are rough estimates, not billing truth."
        }
        loading={loading}
        actions={<ScopeSelect scope={scope} />}
      />
      {graphId ? <GraphAnalyticsView key={graphId} context={{ graphId, runId: null }} compact={false} /> : null}
      {error && !loading ? <p className="text-destructive text-sm">{error}</p> : null}

      {totals ? (
        <>
          {graphId ? null : (
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  ["Invocations", totals.invocations.toLocaleString()],
                  ["Total tokens (est.)", totals.total_tokens.toLocaleString()],
                  ["Estimated spend", USD_FORMATTER.format(totals.estimated_usd)],
                  ["Avg. duration", formatDuration(totals.avg_duration_ms)],
                  ["Input / output tokens", `${totals.input_tokens.toLocaleString()} / ${totals.output_tokens.toLocaleString()}`],
                ] as const
              ).map(([label, value]) => (
                <Card key={label}>
                  <CardHeader>
                    <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">{label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Daily trend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {payload && byStatus && payload.daily.length > 0 ? (
                // One bar per status a day (a server without statuses falls back to the day's total).
                byStatus.statuses.length > 0 ? (
                  <GenuiChart kind="bar" title="Runs per day, by status" rows={byStatus.rows} x="day" y={byStatus.statuses} height={200} />
                ) : (
                  <GenuiChart
                    kind="bar"
                    title="Runs per day"
                    rows={payload.daily.map((point) => ({ day: point.date.slice(5), runs: point.invocations }))}
                    x="day"
                    y={["runs"]}
                    height={180}
                  />
                )
              ) : null}
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
                <p className="text-muted-foreground text-sm">No runs in the last 30 days.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Latency and models</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              {payload?.latency?.length ? (
                <GenuiChart kind="bar" title="Run duration (runs)" rows={latencyRows(payload.latency)} x="duration" y={["runs"]} height={200} />
              ) : (
                <p className="text-muted-foreground text-sm">No finished runs in the last 30 days.</p>
              )}
              {payload?.by_model?.length ? (
                <div className="space-y-3">
                  <GenuiChart kind="bar" title="Model calls" rows={modelRows(payload.by_model)} x="model" y={["calls"]} height={200} />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                          <th className="py-2 pr-4 font-normal">Provider / model</th>
                          <th className="py-2 pr-4 font-normal">Runs</th>
                          <th className="py-2 pr-4 font-normal">Calls</th>
                          <th className="py-2 pr-4 font-normal">Tokens</th>
                          <th className="py-2 font-normal">Est. spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.by_model.map((row) => (
                          <tr key={`${row.provider}/${row.model}`} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-mono text-xs">
                              {row.provider}/{row.model}
                            </td>
                            <td className="py-2 pr-4">{row.runs.toLocaleString()}</td>
                            <td className="py-2 pr-4">{row.calls.toLocaleString()}</td>
                            <td className="py-2 pr-4">{row.tokens.toLocaleString()}</td>
                            <td className="py-2">{USD_FORMATTER.format(row.estimated_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No model calls in the last 30 days.</p>
              )}
            </CardContent>
          </Card>

          {graphId ? null : (
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
                            <td className="py-2 pr-4">
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0"
                                aria-label={`Show analytics for ${row.name}`}
                                onClick={() => scope.setGraphId(row.graph_id)}
                              >
                                {row.name}
                              </Button>
                            </td>
                            <td className="py-2 pr-4">{row.invocations.toLocaleString()}</td>
                            <td className="py-2 pr-4">{row.tokens.toLocaleString()}</td>
                            <td className="py-2">{USD_FORMATTER.format(row.estimated_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No runs in the last 30 days.</p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </StudioPage>
  );
}
