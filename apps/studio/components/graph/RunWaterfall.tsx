import { useEffect, useRef, type CSSProperties } from "react";
import { scrollBehavior } from "@/lib/motion";
import type { NodeTrace } from "@bstockwelldev/agent-graph-sdk";
import { computeWaterfallRows, type WaterfallRow } from "@/lib/runWaterfall";
import { color, fontFamily, radius, spacing, status as statusColor, text, typeScale } from "@/lib/graph-theme";

/** Bars shorter than this stay visible/clickable instead of collapsing to
 * a sliver for a fast node. */
const MIN_BAR_PERCENT = 1.5;

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Historical run waterfall (studio-ux-gap-remediation-plan.md §2): a
 * per-run timing view, one row per executed node, bidirectionally linked
 * to the canvas via `onFocusNode`/`selectedNodeId`. Renders from the same
 * `nodeTraces`/`RunSummary.started_at` data RunPanel's "Node trace" and
 * "Event log" sections already consume — no new backend data needed.
 *
 * Token-styled per apps/studio/AGENTS.md — this renders inside RunPanel,
 * which is itself inside the graph editor route.
 */
export function RunWaterfall({
  nodeTraces,
  runStartedAt,
  runCompletedAt,
  selectedNodeId = null,
  onFocusNode,
}: {
  nodeTraces: Record<string, NodeTrace>;
  runStartedAt: string | null | undefined;
  runCompletedAt?: string | null;
  selectedNodeId?: string | null;
  onFocusNode?: (nodeId: string) => void;
}) {
  const { rows, totalMs } = computeWaterfallRows(nodeTraces, runStartedAt, runCompletedAt);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!selectedNodeId) return;
    rowRefs.current.get(selectedNodeId)?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  }, [selectedNodeId]);

  if (rows.length === 0) {
    return (
      <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
        No node timing to show yet.
      </div>
    );
  }

  return (
    <div>
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[2] }}>
        Total elapsed: {formatMs(totalMs)}
      </div>
      {rows.map((row) => (
        <WaterfallBarRow
          key={row.nodeId}
          row={row}
          totalMs={totalMs}
          selected={row.nodeId === selectedNodeId}
          onFocusNode={onFocusNode}
          registerRef={(el) => {
            if (el) rowRefs.current.set(row.nodeId, el);
            else rowRefs.current.delete(row.nodeId);
          }}
        />
      ))}
    </div>
  );
}

function barColorFor(status: WaterfallRow["status"]): string {
  switch (status) {
    case "succeeded":
      return statusColor.succeeded;
    case "failed":
      return statusColor.failed;
    case "paused":
      return statusColor.paused;
    case "running":
    default:
      return statusColor.running;
  }
}

function WaterfallBarRow({
  row,
  totalMs,
  selected,
  onFocusNode,
  registerRef,
}: {
  row: WaterfallRow;
  totalMs: number;
  selected: boolean;
  onFocusNode?: (nodeId: string) => void;
  registerRef: (el: HTMLButtonElement | null) => void;
}) {
  const leftPercent = (row.startOffsetMs / totalMs) * 100;
  const widthPercent = Math.max((row.durationMs / totalMs) * 100, MIN_BAR_PERCENT);
  const barStyle: CSSProperties = {
    position: "absolute",
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
    top: 2,
    bottom: 2,
    borderRadius: radius.sm,
    background: barColorFor(row.status),
    outline: selected ? `2px solid ${color.primary[500]}` : "none",
    outlineOffset: 1,
    minWidth: 4,
  };

  return (
    <button
      ref={registerRef}
      type="button"
      onClick={() => onFocusNode?.(row.nodeId)}
      title={`${row.nodeId} · ${row.status} · ${formatMs(row.durationMs)} starting at ${formatMs(row.startOffsetMs)}`}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "none",
        padding: 0,
        marginBottom: spacing[2],
        cursor: onFocusNode ? "pointer" : "default",
        font: "inherit",
        color: "inherit",
      }}
    >
      <div
        style={{
          ...typeScale.caption,
          color: text.muted,
          marginBottom: 2,
          fontFamily: fontFamily.mono,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {row.nodeId} <span style={{ opacity: 0.6 }}>· {formatMs(row.durationMs)}</span>
      </div>
      <div style={{ position: "relative", height: 16, background: color.neutral[700], borderRadius: radius.sm }}>
        <div style={barStyle} />
      </div>
    </button>
  );
}
