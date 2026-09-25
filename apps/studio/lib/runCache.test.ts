import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunSummary } from "@bstockwelldev/agent-graph-sdk";
import { cacheRun, getCachedRun, listCachedRuns, mergeRunHistory, RUN_CACHE_LIMIT, RUN_CACHE_STORAGE_KEY } from "./runCache";

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: "run_1",
    graph_id: "graph_a",
    status: "succeeded",
    result: "ok",
    provider: "stub",
    started_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("runCache", () => {
  it("stores finished stub runs with their traces", () => {
    const trace = { node_id: "n1", node_type: "input" as const, status: "succeeded" as const, input: null, output: "x" };
    cacheRun(run(), [trace]);
    expect(getCachedRun("run_1")).toMatchObject({ summary: { run_id: "run_1" }, traces: [trace] });
  });

  it("skips non-stub and unfinished runs", () => {
    cacheRun(run({ run_id: "groq", provider: "groq" }), []);
    cacheRun(run({ run_id: "live", status: "running" }), []);
    expect(getCachedRun("groq")).toBeNull();
    expect(getCachedRun("live")).toBeNull();
  });

  it("keeps only the newest runs", () => {
    for (let i = 0; i < RUN_CACHE_LIMIT + 5; i++) cacheRun(run({ run_id: `run_${i}` }), []);
    expect(listCachedRuns("graph_a")).toHaveLength(RUN_CACHE_LIMIT);
    expect(getCachedRun("run_0")).toBeNull();
    expect(getCachedRun(`run_${RUN_CACHE_LIMIT + 4}`)).not.toBeNull();
  });

  it("filters by graph", () => {
    cacheRun(run({ run_id: "a" }), []);
    cacheRun(run({ run_id: "b", graph_id: "graph_b" }), []);
    expect(listCachedRuns("graph_b").map((r) => r.run_id)).toEqual(["b"]);
  });

  it("ignores unavailable or corrupt storage", () => {
    window.localStorage.setItem(RUN_CACHE_STORAGE_KEY, "{not json");
    expect(listCachedRuns("graph_a")).toEqual([]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => cacheRun(run(), [])).not.toThrow();
  });
});

describe("mergeRunHistory", () => {
  it("adds cached runs the server doesn't know about, newest first", () => {
    const server = [run({ run_id: "s1", started_at: "2026-09-25T09:00:00Z" })];
    const cached = [run({ run_id: "s1" }), run({ run_id: "c1", started_at: "2026-09-25T11:00:00Z" })];
    expect(mergeRunHistory(server, cached).map((r) => r.run_id)).toEqual(["c1", "s1"]);
  });
});
