import type { NodeTrace, NodeType } from "@bstockwelldev/agent-graph-sdk";

/**
 * Historical run waterfall (studio-ux-gap-remediation-plan.md §2): pure
 * computation of per-node timing offsets relative to run start, so the
 * component just renders. One row per node — parallel execution shows up
 * as overlapping time ranges across rows, sequential as non-overlapping
 * ones, with no separate lane-packing needed.
 */
export interface WaterfallRow {
  nodeId: string;
  nodeType: NodeType;
  status: NodeTrace["status"];
  startOffsetMs: number;
  durationMs: number;
}

export interface WaterfallComputation {
  rows: WaterfallRow[];
  /** Total elapsed span to scale bar positions/widths against. At least 1
   * to avoid a division by zero when nothing has run long enough to measure. */
  totalMs: number;
}

const EMPTY: WaterfallComputation = { rows: [], totalMs: 0 };

export function computeWaterfallRows(
  nodeTraces: Record<string, NodeTrace>,
  runStartedAt: string | null | undefined,
  runCompletedAt: string | null | undefined,
  now: number = Date.now(),
): WaterfallComputation {
  if (!runStartedAt) return EMPTY;
  const runStart = new Date(runStartedAt).getTime();
  if (Number.isNaN(runStart)) return EMPTY;

  const rows: WaterfallRow[] = Object.values(nodeTraces).map((trace) => {
    const start = new Date(trace.started_at).getTime();
    const end = trace.completed_at ? new Date(trace.completed_at).getTime() : now;
    return {
      nodeId: trace.node_id,
      nodeType: trace.node_type,
      status: trace.status,
      startOffsetMs: Math.max(0, start - runStart),
      durationMs: Math.max(0, end - start),
    };
  });
  rows.sort((a, b) => a.startOffsetMs - b.startOffsetMs);

  const runEndOffset = runCompletedAt ? new Date(runCompletedAt).getTime() - runStart : 0;
  const totalMs = Math.max(runEndOffset, ...rows.map((row) => row.startOffsetMs + row.durationMs), 1);

  return { rows, totalMs };
}
