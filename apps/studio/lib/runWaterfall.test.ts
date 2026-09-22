import { describe, expect, it } from "vitest";
import type { NodeTrace } from "@bstockwelldev/agent-graph-sdk";

import { computeWaterfallRows } from "./runWaterfall";

function trace(overrides: Partial<NodeTrace> & Pick<NodeTrace, "node_id">): NodeTrace {
  return {
    node_type: "llm",
    status: "succeeded",
    started_at: "2026-09-22T00:00:00.000Z",
    completed_at: "2026-09-22T00:00:01.000Z",
    ...overrides,
  };
}

describe("computeWaterfallRows", () => {
  it("returns empty when there is no run start time", () => {
    expect(computeWaterfallRows({ a: trace({ node_id: "a" }) }, null, null)).toEqual({ rows: [], totalMs: 0 });
  });

  it("computes offsets and durations relative to run start, sorted chronologically", () => {
    const runStartedAt = "2026-09-22T00:00:00.000Z";
    const nodeTraces: Record<string, NodeTrace> = {
      b: trace({ node_id: "b", started_at: "2026-09-22T00:00:00.500Z", completed_at: "2026-09-22T00:00:01.000Z" }),
      a: trace({ node_id: "a", started_at: "2026-09-22T00:00:00.000Z", completed_at: "2026-09-22T00:00:00.400Z" }),
    };
    const { rows, totalMs } = computeWaterfallRows(nodeTraces, runStartedAt, null);
    expect(rows.map((r) => r.nodeId)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({ nodeId: "a", startOffsetMs: 0, durationMs: 400 });
    expect(rows[1]).toMatchObject({ nodeId: "b", startOffsetMs: 500, durationMs: 500 });
    expect(totalMs).toBe(1000);
  });

  it("shows overlapping time ranges for parallel nodes (no lane-packing needed)", () => {
    const runStartedAt = "2026-09-22T00:00:00.000Z";
    const nodeTraces: Record<string, NodeTrace> = {
      toolA: trace({ node_id: "toolA", started_at: "2026-09-22T00:00:00.000Z", completed_at: "2026-09-22T00:00:00.900Z" }),
      toolB: trace({ node_id: "toolB", started_at: "2026-09-22T00:00:00.100Z", completed_at: "2026-09-22T00:00:00.700Z" }),
    };
    const { rows } = computeWaterfallRows(nodeTraces, runStartedAt, null);
    const [a, b] = rows;
    // b starts before a finishes — they overlap in time, i.e. ran in parallel.
    expect(b.startOffsetMs).toBeLessThan(a.startOffsetMs + a.durationMs);
  });

  it("treats a still-running node's duration as elapsed-so-far using the injected clock", () => {
    const runStartedAt = "2026-09-22T00:00:00.000Z";
    const nodeTraces: Record<string, NodeTrace> = {
      a: trace({ node_id: "a", status: "running", started_at: "2026-09-22T00:00:00.000Z", completed_at: null }),
    };
    const now = new Date("2026-09-22T00:00:02.000Z").getTime();
    const { rows, totalMs } = computeWaterfallRows(nodeTraces, runStartedAt, null, now);
    expect(rows[0]).toMatchObject({ nodeId: "a", startOffsetMs: 0, durationMs: 2000 });
    expect(totalMs).toBe(2000);
  });

  it("uses the run's own completed_at as a floor even if it exceeds the last node's end", () => {
    const runStartedAt = "2026-09-22T00:00:00.000Z";
    const runCompletedAt = "2026-09-22T00:00:05.000Z";
    const nodeTraces: Record<string, NodeTrace> = {
      a: trace({ node_id: "a", started_at: "2026-09-22T00:00:00.000Z", completed_at: "2026-09-22T00:00:01.000Z" }),
    };
    const { totalMs } = computeWaterfallRows(nodeTraces, runStartedAt, runCompletedAt);
    expect(totalMs).toBe(5000);
  });

  it("returns an empty row set for a run with no node traces yet", () => {
    expect(computeWaterfallRows({}, "2026-09-22T00:00:00.000Z", null)).toEqual({ rows: [], totalMs: 1 });
  });
});
