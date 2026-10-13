"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnalyticsDashboardPayload, GraphAnalytics } from "@bstockwelldev/agent-graph-sdk";

import { Card, Stat } from "@/components/graph/ui/Card";
import { GenuiChart } from "@/components/graph/ui/genui/GenuiChart";
import { SegmentedControl } from "@/components/graph/ui/SegmentedControl";
import { client } from "@/lib/api-client";
import { latencyRows, modelRows, statusByDay } from "@/lib/analyticsCharts";
import { accentSurface, border, fontFamily, localType, spacing, text, typeScale } from "@/lib/graph-theme";
import { formatDurationMs, formatRate, isUnhealthy } from "@/lib/nodeMetrics";
import { useWorkbench, type StudioGraphContext } from "@/components/workbench/WorkbenchProvider";

/**
 * Phase 10 Slice A (docs/planning/features/studio-shell-ux-gap-analysis.md):
 * the dashboard as a HUD panel so it's reachable via Cmd/Ctrl+K without
 * leaving the canvas. Global scope, not graph-scoped:
 * `client.analytics.dashboard()` spans every graph in the workspace. Token
 * counts / spend are estimates (chars/4 heuristic — AGB's ChatModel protocol
 * has no real usage data), not billing truth; see backend/app/analytics.py's
 * module docstring. Styled from the canvas tokens and the graph kit
 * (canvas-styling-plan.md, PR 2).
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

// ---- Shared bits ------------------------------------------------------------

const caption: CSSProperties = { margin: 0, ...typeScale.caption, color: text.secondary };
const stack: CSSProperties = { display: "flex", flexDirection: "column", gap: spacing[3] };
const statGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: spacing[3] };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", ...typeScale.caption, color: text.primary };
const th: CSSProperties = { ...localType.label, color: text.secondary, fontWeight: 400, textAlign: "left", padding: "4px 8px 4px 0", borderBottom: `1px solid ${border.subtle}` };
const td: CSSProperties = { padding: "4px 8px 4px 0", borderBottom: `1px solid ${border.subtle}` };
const linkButton: CSSProperties = {
  border: 0,
  background: "none",
  padding: 0,
  color: text.primary,
  textAlign: "left",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  cursor: "pointer",
  font: "inherit",
};

/** A table that scrolls sideways in a narrow panel, keyboard-reachable when it does. */
function Scroller({ children }: { children: ReactNode }) {
  return (
    <div tabIndex={0} className="agb-focus-ring" style={{ overflowX: "auto" }}>
      {children}
    </div>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <p style={caption}>{children}</p>;

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
    <div style={stack}>
      {loading ? <Muted>Loading…</Muted> : null}
      {error && !loading ? <p style={{ margin: 0, ...localType.ui, color: accentSurface.destructive.text }}>{error}</p> : null}

      {totals ? (
        <>
          {graphId ? null : (
            <section style={statGrid}>
              <Stat label="Invocations" value={totals.invocations.toLocaleString()} />
              <Stat label="Total tokens (est.)" value={totals.total_tokens.toLocaleString()} />
              <Stat label="Estimated spend" value={USD_FORMATTER.format(totals.estimated_usd)} />
              <Stat label="Avg. duration" value={formatDuration(totals.avg_duration_ms)} />
              <Stat label="Input / output tokens" value={`${totals.input_tokens.toLocaleString()} / ${totals.output_tokens.toLocaleString()}`} />
            </section>
          )}

          <Card title="Daily trend">
            <div style={stack}>
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
                <Scroller>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Date</th>
                        <th style={th}>Runs</th>
                        <th style={th}>Tokens</th>
                        <th style={th}>Est. spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.daily.map((point) => (
                        <tr key={point.date}>
                          <td style={td}>{point.date}</td>
                          <td style={td}>{point.invocations.toLocaleString()}</td>
                          <td style={td}>{point.tokens.toLocaleString()}</td>
                          <td style={td}>{USD_FORMATTER.format(point.estimated_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroller>
              ) : (
                <Muted>No runs in the last 30 days.</Muted>
              )}
            </div>
          </Card>

          <Card title="Latency and models">
            <div style={stack}>
              {payload?.latency?.length ? (
                <GenuiChart kind="bar" title="Run duration (runs)" rows={latencyRows(payload.latency)} x="duration" y={["runs"]} height={180} />
              ) : (
                <Muted>No finished runs in the last 30 days.</Muted>
              )}
              {payload?.by_model?.length ? (
                <div style={stack}>
                  <GenuiChart kind="bar" title="Model calls" rows={modelRows(payload.by_model)} x="model" y={["calls"]} height={180} />
                  <Scroller>
                    <table style={table}>
                      <thead>
                        <tr>
                          <th style={th}>Provider / model</th>
                          <th style={th}>Runs</th>
                          <th style={th}>Calls</th>
                          <th style={th}>Tokens</th>
                          <th style={th}>Est. spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.by_model.map((row) => (
                          <tr key={`${row.provider}/${row.model}`}>
                            <td style={{ ...td, fontFamily: fontFamily.mono }}>
                              {row.provider}/{row.model}
                            </td>
                            <td style={td}>{row.runs.toLocaleString()}</td>
                            <td style={td}>{row.calls.toLocaleString()}</td>
                            <td style={td}>{row.tokens.toLocaleString()}</td>
                            <td style={td}>{USD_FORMATTER.format(row.estimated_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Scroller>
                </div>
              ) : (
                <Muted>No model calls in the last 30 days.</Muted>
              )}
            </div>
          </Card>

          {graphId ? null : (
            <Card title="By graph">
              {payload && payload.by_graph.length > 0 ? (
                <Scroller>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Graph</th>
                        <th style={th}>Runs</th>
                        <th style={th}>Tokens</th>
                        <th style={th}>Est. spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.by_graph.map((row) => (
                        <tr key={row.graph_id}>
                          <td style={td}>
                            <button
                              type="button"
                              className="agb-focus-ring"
                              style={linkButton}
                              onClick={() => (onOpenGraph ? onOpenGraph(row.graph_id) : router.push(`/graphs/${row.graph_id}?panel=analytics&scope=graph`))}
                            >
                              {row.name}
                            </button>
                          </td>
                          <td style={td}>{row.invocations.toLocaleString()}</td>
                          <td style={td}>{row.tokens.toLocaleString()}</td>
                          <td style={td}>{USD_FORMATTER.format(row.estimated_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroller>
              ) : (
                <Muted>No runs yet.</Muted>
              )}
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
    <div style={{ ...stack, gap: spacing[4], padding: spacing[3], color: text.primary }}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
        {/* Titled by the drawer's title bar. */}
        <p style={caption}>
          {graphScoped
            ? `${graphContext.graphName || graphContext.graphId} — recent runs, per node.`
            : "Run totals, a daily trend, and per-graph spend across every graph."}{" "}
          Estimates, not billing truth.
        </p>
        {graphContext && (
          <SegmentedControl
            aria-label="Analytics scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: "graph", label: "This graph" },
              { value: "workspace", label: "Workspace" },
            ]}
          />
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
  charts = false,
}: {
  context: GraphAnalyticsContext;
  /** The per-node P95 latency chart; the panel turns it on. */
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

  if (error) return <p style={{ margin: 0, ...localType.ui, color: accentSurface.destructive.text }}>{error}</p>;
  if (!payload) return <Muted>Loading…</Muted>;
  const latencyRows = payload.nodes
    .filter((node) => node.p95_duration_ms !== null)
    .slice(0, 12)
    .map((node) => ({ node: node.node_id, "p95 ms": node.p95_duration_ms }));
  if (payload.run_window === 0) {
    return <Muted>No runs yet for this graph. Run it to see per-node metrics.</Muted>;
  }

  return (
    <div style={stack}>
      <section style={statGrid}>
        <Stat label="Runs (recent)" value={payload.run_window.toLocaleString()} />
        <Stat label="Success rate" value={formatRate(payload.success_rate)} />
        <Stat label="P95 run latency" value={formatDurationMs(payload.p95_duration_ms)} />
        <Stat label="Estimated spend" value={USD_FORMATTER.format(payload.totals.estimated_usd)} />
      </section>

      {charts && latencyRows.length > 0 ? (
        <Card>
          <GenuiChart kind="bar" title="P95 latency by node (ms)" rows={latencyRows} x="node" y={["p95 ms"]} height={200} />
        </Card>
      ) : null}

      <Card title="Nodes (slowest first)">
        <Scroller>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Node</th>
                <th style={th}>Runs</th>
                <th style={th}>Success</th>
                <th style={th}>P95</th>
                <th style={th}>Last</th>
              </tr>
            </thead>
            <tbody>
              {payload.nodes.map((node) => (
                <tr key={node.node_id}>
                  <td style={td}>
                    {context.focusNode ? (
                      <button
                        type="button"
                        className="agb-focus-ring"
                        style={{ ...linkButton, fontWeight: 600 }}
                        title="Focus this node and open its history"
                        onClick={() => context.focusNode?.(node.node_id, "history")}
                      >
                        {node.node_id}
                      </button>
                    ) : (
                      <Link
                        href={`/graphs/${encodeURIComponent(graphId)}?node=${encodeURIComponent(node.node_id)}&tab=history`}
                        className="agb-focus-ring"
                        style={{ ...linkButton, fontWeight: 600 }}
                      >
                        {node.node_id}
                      </Link>
                    )}
                    <span style={{ color: text.secondary }}> · {node.node_type}</span>
                  </td>
                  <td style={td}>{node.executions}</td>
                  <td style={{ ...td, ...(isUnhealthy(node) ? { color: accentSurface.destructive.text, fontWeight: 600 } : null) }} title={node.last_error ?? undefined}>
                    {formatRate(node.success_rate)}
                  </td>
                  <td style={td}>{formatDurationMs(node.p95_duration_ms)}</td>
                  <td style={td}>
                    {node.last_run_id && context.inspectRun ? (
                      <button type="button" className="agb-focus-ring" style={linkButton} title="Inspect this run on the canvas" onClick={() => context.inspectRun?.(node.last_run_id!)}>
                        run
                      </button>
                    ) : node.last_run_id ? (
                      <Link
                        href={`/graphs/${encodeURIComponent(graphId)}?run=${encodeURIComponent(node.last_run_id)}&panel=run`}
                        className="agb-focus-ring"
                        style={linkButton}
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
        </Scroller>
      </Card>
    </div>
  );
}
