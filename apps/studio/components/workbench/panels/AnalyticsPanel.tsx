"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalyticsDashboardPayload, GraphAnalytics } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
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

function WorkspaceAnalytics() {
  const router = useRouter();
  const [payload, setPayload] = useState<AnalyticsDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const dashboard = await client.analytics.dashboard();
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
    <div className="space-y-4">
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
                          <td className="py-1 pr-2">
                            <button
                              type="button"
                              className="hover:text-primary text-left underline-offset-2 hover:underline"
                              onClick={() => router.push(`/graphs/${row.graph_id}`)}
                            >
                              {row.name}
                            </button>
                          </td>
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

/**
 * Wave 2 (studio-graph-workbench-redesign-plan.md; review sections 36-38,
 * "Analytics must be embedded / Node analytics / Analytics as context"):
 * with a graph open, the panel defaults to that graph's scope -- success
 * rate, P95, spend, and a per-node table (slowest first) whose rows focus
 * the node on the canvas and open its History tab. The workspace-wide
 * dashboard stays one toggle away.
 */
export function AnalyticsPanel() {
  const { graphContext } = useWorkbench();
  const [scope, setScope] = useState<"graph" | "workspace">("graph");
  const graphScoped = scope === "graph" && graphContext !== null;

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Analytics</h2>
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
      {graphScoped ? <GraphAnalyticsView context={graphContext} /> : <WorkspaceAnalytics />}
    </div>
  );
}

export function GraphAnalyticsView({ context }: { context: StudioGraphContext }) {
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
  if (payload.run_window === 0) {
    return <p className="text-muted-foreground text-sm">No runs yet for this graph. Run it to see per-node metrics.</p>;
  }

  return (
    <>
      <section className="grid grid-cols-2 gap-3">
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
                      <button
                        type="button"
                        className="hover:text-primary text-left font-medium underline-offset-2 hover:underline"
                        title="Focus this node and open its history"
                        onClick={() => context.focusNode?.(node.node_id, "history")}
                      >
                        {node.node_id}
                      </button>
                      <span className="text-muted-foreground"> · {node.node_type}</span>
                    </td>
                    <td className="py-1 pr-2">{node.executions}</td>
                    <td className={cn("py-1 pr-2", isUnhealthy(node) && "text-destructive font-semibold")} title={node.last_error ?? undefined}>
                      {formatRate(node.success_rate)}
                    </td>
                    <td className="py-1 pr-2">{formatDurationMs(node.p95_duration_ms)}</td>
                    <td className="py-1">
                      {node.last_run_id ? (
                        <button
                          type="button"
                          className="hover:text-primary underline-offset-2 hover:underline"
                          title="Inspect this run on the canvas"
                          onClick={() => context.inspectRun?.(node.last_run_id!)}
                        >
                          run
                        </button>
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
