"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnalyticsDashboardPayload, GraphAnalytics } from "@bstockwelldev/agent-graph-sdk";

import { GenuiChart } from "@/components/graph/ui/genui/GenuiChart";
import { client } from "@/lib/api-client";
import { latencyRows, modelRows, statusByDay } from "@/lib/analyticsCharts";
import { formatDurationMs, formatRate, isUnhealthy } from "@/lib/nodeMetrics";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWorkbench, type StudioGraphContext } from "@/components/workbench/WorkbenchProvider";

/**
 * Phase 10 Slice A (docs/planning/features/studio-shell-ux-gap-analysis.md):
 * the same dashboard body as `app/analytics/page.tsx`, ported into a HUD
 * panel so it's reachable via Cmd/Ctrl+K without leaving the canvas — the
 * gap analysis's Tier 1 finding that /analytics had no HUD door at all.
 * Global scope, not graph-scoped: `client.analytics.dashboard()` spans every
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

/**
 * The dashboard body the retired /analytics page showed (canvas-first landing
 * plan, Phase 3): totals, runs per day (a chart by status, and a table), run
 * durations, model calls and spend per graph. Whole workspace, or one graph
 * (`graphId`), in which case the totals and by-graph rows are left out.
 */
function AnalyticsDashboard({ graphId, onOpenGraph }: { graphId?: string; onOpenGraph?: (graphId: string) => void }) {
  const router = useRouter();
  const [payload, setPayload] = useState<AnalyticsDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [graphId]);

  const totals = payload?.totals;
  const byStatus = payload ? statusByDay(payload.daily) : null;

  return (
    <div className="space-y-4">
      {loading ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
      {error && !loading ? <p className="text-destructive text-sm">{error}</p> : null}

      {totals ? (
        <>
          {graphId ? null : (
            <section className="grid grid-cols-2 gap-3">
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
                  <CardHeader className="pb-1">
                    <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">{label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Daily trend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {payload && byStatus && payload.daily.length > 0 ? (
                // One bar per status a day (a server without statuses falls back to the day's total).
                byStatus.statuses.length > 0 ? (
                  <GenuiChart kind="bar" title="Runs per day, by status" rows={byStatus.rows} x="day" y={byStatus.statuses} height={180} />
                ) : (
                  <GenuiChart
                    kind="bar"
                    title="Runs per day"
                    rows={payload.daily.map((point) => ({ day: point.date.slice(5), runs: point.invocations }))}
                    x="day"
                    y={["runs"]}
                    height={160}
                  />
                )
              ) : null}
              {payload && payload.daily.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left uppercase tracking-wide">
                        <th className="py-1 pr-2 font-normal">Date</th>
                        <th className="py-1 pr-2 font-normal">Runs</th>
                        <th className="py-1 pr-2 font-normal">Tokens</th>
                        <th className="py-1 font-normal">Est. spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.daily.map((point) => (
                        <tr key={point.date} className="border-b last:border-0">
                          <td className="py-1 pr-2">{point.date}</td>
                          <td className="py-1 pr-2">{point.invocations.toLocaleString()}</td>
                          <td className="py-1 pr-2">{point.tokens.toLocaleString()}</td>
                          <td className="py-1">{USD_FORMATTER.format(point.estimated_usd)}</td>
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
              <CardTitle className="text-sm">Latency and models</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {payload?.latency?.length ? (
                <GenuiChart kind="bar" title="Run duration (runs)" rows={latencyRows(payload.latency)} x="duration" y={["runs"]} height={180} />
              ) : (
                <p className="text-muted-foreground text-sm">No finished runs in the last 30 days.</p>
              )}
              {payload?.by_model?.length ? (
                <div className="space-y-3">
                  <GenuiChart kind="bar" title="Model calls" rows={modelRows(payload.by_model)} x="model" y={["calls"]} height={180} />
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b text-left uppercase tracking-wide">
                          <th className="py-1 pr-2 font-normal">Provider / model</th>
                          <th className="py-1 pr-2 font-normal">Runs</th>
                          <th className="py-1 pr-2 font-normal">Calls</th>
                          <th className="py-1 pr-2 font-normal">Tokens</th>
                          <th className="py-1 font-normal">Est. spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.by_model.map((row) => (
                          <tr key={`${row.provider}/${row.model}`} className="border-b last:border-0">
                            <td className="py-1 pr-2 font-mono">
                              {row.provider}/{row.model}
                            </td>
                            <td className="py-1 pr-2">{row.runs.toLocaleString()}</td>
                            <td className="py-1 pr-2">{row.calls.toLocaleString()}</td>
                            <td className="py-1 pr-2">{row.tokens.toLocaleString()}</td>
                            <td className="py-1">{USD_FORMATTER.format(row.estimated_usd)}</td>
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
                          <th className="py-1 pr-2 font-normal">Tokens</th>
                          <th className="py-1 font-normal">Est. spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.by_graph.map((row) => (
                          <tr key={row.graph_id} className="border-b last:border-0">
                            <td className="py-1 pr-2">
                              <button
                                type="button"
                                className="hover:text-primary text-left underline-offset-2 hover:underline"
                                onClick={() => (onOpenGraph ? onOpenGraph(row.graph_id) : router.push(`/graphs/${row.graph_id}?panel=analytics&scope=graph`))}
                              >
                                {row.name}
                              </button>
                            </td>
                            <td className="py-1 pr-2">{row.invocations.toLocaleString()}</td>
                            <td className="py-1 pr-2">{row.tokens.toLocaleString()}</td>
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
          )}
        </>
      ) : null}
    </div>
  );
}

/**
 * Wave 2 (studio-graph-workbench-redesign-plan.md; review sections 36-38,
 * "Analytics must be embedded / Node analytics / Analytics as context"):
 * with a graph open, the panel defaults to that graph's scope -- success
 * rate, P95, spend, and a per-node table (slowest first) whose rows focus
 * the node on the canvas and open its History tab. The workspace-wide
 * dashboard stays one toggle away.
 */
export function AnalyticsPanel() {
  const router = useRouter();
  const { graphContext, panelContext } = useWorkbench();
  // `?panel=analytics&scope=workspace|graph` arrives as the panel context
  // (lib/graphUrlState.ts); it re-applies whenever the panel is reopened.
  const requestedScope = (panelContext as { scope?: string } | null)?.scope;
  const [scope, setScope] = useState<"graph" | "workspace">(requestedScope === "workspace" ? "workspace" : "graph");
  useEffect(() => {
    if (requestedScope === "workspace" || requestedScope === "graph") setScope(requestedScope);
  }, [requestedScope, panelContext]);
  const graphScoped = scope === "graph" && graphContext !== null;

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          {/* Titled by the drawer's title bar. */}
          <p className="text-muted-foreground text-xs">
            {graphScoped
              ? `${graphContext.graphName || graphContext.graphId} — recent runs, per node.`
              : "Run totals, a daily trend, and per-graph spend across every graph."}{" "}
            Estimates, not billing truth.
          </p>
        </div>
        {graphContext && (
          <div className="flex shrink-0 rounded-md border p-0.5" role="group" aria-label="Analytics scope">
            {(["graph", "workspace"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={scope === value ? "secondary" : "ghost"}
                className="h-6 px-2 text-xs"
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
              >
                {value === "graph" ? "This graph" : "Workspace"}
              </Button>
            ))}
          </div>
        )}
      </div>
      {graphScoped ? (
        <>
          <GraphAnalyticsView context={graphContext} charts />
          <AnalyticsDashboard graphId={graphContext.graphId} />
        </>
      ) : (
        <AnalyticsDashboard
          // The graph that is already open just switches scope; another graph opens with its analytics.
          onOpenGraph={(id) => (graphContext && id === graphContext.graphId ? setScope("graph") : router.push(`/graphs/${id}?panel=analytics&scope=graph`))}
        />
      )}
    </div>
  );
}

/** What the graph view needs: the canvas's context in the panel, or just a
 * graph id (node rows then link to the editor instead of focusing a node). */
export type GraphAnalyticsContext = Pick<StudioGraphContext, "graphId" | "runId" | "focusNode" | "inspectRun">;

export function GraphAnalyticsView({
  context,
  compact = true,
  charts = !compact,
}: {
  context: GraphAnalyticsContext;
  compact?: boolean;
  /** The per-node P95 latency chart. On by default only when not compact; the panel asks for it in its narrow layout. */
  charts?: boolean;
}) {
  const [payload, setPayload] = useState<GraphAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { graphId, runId } = context;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    client
      .analytics.graph(graphId)
      .then((result) => {
        if (!cancelled) setPayload(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // Refetch when a new run is painted onto the canvas.
  }, [graphId, runId]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!payload) return <p className="text-muted-foreground text-sm">Loading…</p>;
  const latencyRows = payload.nodes
    .filter((node) => node.p95_duration_ms !== null)
    .slice(0, 12)
    .map((node) => ({ node: node.node_id, "p95 ms": node.p95_duration_ms }));
  if (payload.run_window === 0) {
    return <p className="text-muted-foreground text-sm">No runs yet for this graph. Run it to see per-node metrics.</p>;
  }

  return (
    <>
      <section className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
        {(
          [
            ["Runs (recent)", payload.run_window.toLocaleString()],
            ["Success rate", formatRate(payload.success_rate)],
            ["P95 run latency", formatDurationMs(payload.p95_duration_ms)],
            ["Estimated spend", USD_FORMATTER.format(payload.totals.estimated_usd)],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {charts && latencyRows.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <GenuiChart kind="bar" title="P95 latency by node (ms)" rows={latencyRows} x="node" y={["p95 ms"]} height={200} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Nodes (slowest first)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b text-left uppercase tracking-wide">
                  <th className="py-1 pr-2 font-normal">Node</th>
                  <th className="py-1 pr-2 font-normal">Runs</th>
                  <th className="py-1 pr-2 font-normal">Success</th>
                  <th className="py-1 pr-2 font-normal">P95</th>
                  <th className="py-1 font-normal">Last</th>
                </tr>
              </thead>
              <tbody>
                {payload.nodes.map((node) => (
                  <tr key={node.node_id} className="border-b last:border-0">
                    <td className="py-1 pr-2">
                      {context.focusNode ? (
                        <button
                          type="button"
                          className="hover:text-primary text-left font-medium underline-offset-2 hover:underline"
                          title="Focus this node and open its history"
                          onClick={() => context.focusNode?.(node.node_id, "history")}
                        >
                          {node.node_id}
                        </button>
                      ) : (
                        <Link
                          href={`/graphs/${encodeURIComponent(graphId)}?node=${encodeURIComponent(node.node_id)}&tab=history`}
                          className="hover:text-primary font-medium underline-offset-2 hover:underline"
                        >
                          {node.node_id}
                        </Link>
                      )}
                      <span className="text-muted-foreground"> · {node.node_type}</span>
                    </td>
                    <td className="py-1 pr-2">{node.executions}</td>
                    <td className={cn("py-1 pr-2", isUnhealthy(node) && "text-destructive font-semibold")} title={node.last_error ?? undefined}>
                      {formatRate(node.success_rate)}
                    </td>
                    <td className="py-1 pr-2">{formatDurationMs(node.p95_duration_ms)}</td>
                    <td className="py-1">
                      {node.last_run_id && context.inspectRun ? (
                        <button
                          type="button"
                          className="hover:text-primary underline-offset-2 hover:underline"
                          title="Inspect this run on the canvas"
                          onClick={() => context.inspectRun?.(node.last_run_id!)}
                        >
                          run
                        </button>
                      ) : node.last_run_id ? (
                        <Link
                          href={`/graphs/${encodeURIComponent(graphId)}?run=${encodeURIComponent(node.last_run_id)}&panel=run`}
                          className="hover:text-primary underline-offset-2 hover:underline"
                          aria-label={`Inspect ${node.node_id}'s last run`}
                        >
                          run
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
