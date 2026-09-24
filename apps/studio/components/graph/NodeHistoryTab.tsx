"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { NodeExecution, NodeMetrics } from "@bstockwelldev/agent-graph-sdk";
import { client } from "@/lib/api-client";
import { color, radius, spacing, status as statusColor, surface, text, typeScale } from "@/lib/graph-theme";
import { formatDurationMs, formatRate, isUnhealthy, relativeTime } from "@/lib/nodeMetrics";
import { SkeletonBlock } from "./ui/Skeleton";

const STATUS_TONE: Record<string, string> = {
  succeeded: statusColor.succeeded,
  failed: statusColor.failed,
  running: statusColor.running,
  paused: statusColor.paused,
};

/**
 * NodeInspector "History" tab (studio-graph-workbench-redesign-plan.md,
 * Wave 2; review sections 15 and 37: "Selected → run history, evaluation"
 * and "Node analytics"). Metrics come from the graph-scoped rollup, the list
 * from the node's own recent executions; both backend-computed
 * (backend/app/node_analytics.py). Each execution row inspects that run on
 * the canvas without leaving the graph.
 *
 * `refreshKey` changes whenever a run finishes, so the tab refetches.
 */
export function NodeHistoryTab({
  graphId,
  nodeId,
  refreshKey,
  onInspectRun,
}: {
  graphId: string;
  nodeId: string;
  refreshKey?: string | null;
  onInspectRun?: (runId: string) => void;
}) {
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null);
  const [history, setHistory] = useState<NodeExecution[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([client.analytics.graph(graphId), client.analytics.nodeHistory(graphId, nodeId, { limit: 15 })])
      .then(([analytics, executions]) => {
        if (cancelled) return;
        setMetrics(analytics.nodes.find((node) => node.node_id === nodeId) ?? null);
        setHistory(executions);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [graphId, nodeId, refreshKey]);

  if (error) {
    return <div style={{ ...typeScale.caption, color: color.error[500] }}>{error}</div>;
  }
  if (history === null) {
    return <SkeletonBlock lines={3} gap={spacing[2]} />;
  }
  if (history.length === 0) {
    return (
      <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
        This node hasn&apos;t run yet. Its executions, success rate, and latency show up here after the graph runs.
      </div>
    );
  }

  return (
    <div>
      {metrics && (
        <div
          role="group"
          aria-label="Node performance"
          style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: spacing[2], marginBottom: spacing[3] }}
        >
          <Metric label="Success" value={formatRate(metrics.success_rate)} tone={isUnhealthy(metrics) ? color.error[500] : undefined} />
          <Metric label="Executions" value={String(metrics.executions)} />
          <Metric label="Avg latency" value={formatDurationMs(metrics.avg_duration_ms)} />
          <Metric label="P95 latency" value={formatDurationMs(metrics.p95_duration_ms)} />
        </div>
      )}
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>Recent executions</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {history.map((execution) => (
          <li key={execution.run_id}>
            <button
              type="button"
              className="agb-focus-ring agb-hoverable"
              onClick={() => onInspectRun?.(execution.run_id)}
              title={execution.error ?? `Inspect run ${execution.run_id}`}
              style={rowStyle}
            >
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: STATUS_TONE[execution.status] ?? surface.borderStrong }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{execution.status}</span>
                <span style={{ opacity: 0.6 }}> · {relativeTime(execution.started_at)}</span>
                {execution.error && (
                  <span style={{ display: "block", color: color.error[500], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {execution.error}
                  </span>
                )}
              </span>
              <span style={{ opacity: 0.7, flexShrink: 0 }}>{formatDurationMs(execution.duration_ms)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ padding: spacing[2], borderRadius: radius.lg, border: `1px solid ${surface.border}`, background: surface.raised }}>
      <div style={{ ...typeScale.caption, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: tone ?? text.primary }}>{value}</div>
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[2],
  width: "100%",
  textAlign: "left",
  padding: `6px ${spacing[2]}px`,
  marginBottom: 2,
  borderRadius: radius.md,
  border: "none",
  background: "transparent",
  color: text.primary,
  cursor: "pointer",
  ...typeScale.caption,
};
