import { describe, expect, it } from "vitest";

import { latencyRows, modelRows, statusByDay } from "./analyticsCharts";

describe("analytics chart rows", () => {
  it("gives every day a column per status seen, known statuses first", () => {
    const { rows, statuses } = statusByDay([
      { date: "2026-09-01", invocations: 3, tokens: 0, estimated_usd: 0, by_status: { failed: 1, succeeded: 2 } },
      { date: "2026-09-02", invocations: 2, tokens: 0, estimated_usd: 0, by_status: { unknown: 1, paused: 1 } },
    ]);
    expect(statuses).toEqual(["succeeded", "failed", "paused", "unknown"]);
    expect(rows).toEqual([
      { day: "09-01", succeeded: 2, failed: 1, paused: 0, unknown: 0 },
      { day: "09-02", succeeded: 0, failed: 0, paused: 1, unknown: 1 },
    ]);
  });

  it("labels latency buckets and models", () => {
    expect(latencyRows([{ label: "<250 ms", min_ms: 0, max_ms: 250, runs: 4 }])).toEqual([{ duration: "<250 ms", runs: 4 }]);
    expect(modelRows([{ provider: "groq", model: "llama", runs: 2, calls: 5, tokens: 10, estimated_usd: 0 }])).toEqual([
      { model: "groq/llama", calls: 5 },
    ]);
  });
});
