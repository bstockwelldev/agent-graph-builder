import { afterEach, describe, expect, it, vi } from "vitest";

import { LAST_GRAPH_KEY, clearLastGraph, readLastGraph, sortRecent, writeLastGraph } from "./lastGraph";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

// canvas-first-landing-plan.md §3: every storage read and write is guarded.
describe("last graph", () => {
  it("round-trips and clears", () => {
    expect(readLastGraph()).toBeNull();
    writeLastGraph("g1");
    expect(window.localStorage.getItem(LAST_GRAPH_KEY)).toBe("g1");
    expect(readLastGraph()).toBe("g1");
    clearLastGraph();
    expect(readLastGraph()).toBeNull();
  });

  it("treats unavailable storage as no last graph, without throwing", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
    expect(readLastGraph()).toBeNull();
    expect(() => writeLastGraph("g1")).not.toThrow();
    expect(() => clearLastGraph()).not.toThrow();
  });

  it("sorts newest first, with undated graphs last in their given order", () => {
    const graphs = [
      { id: "none_a" },
      { id: "old", updated_at: "2026-01-01T00:00:00Z" },
      { id: "none_b", updated_at: null },
      { id: "new", updated_at: "2026-09-01T00:00:00Z" },
    ];
    expect(sortRecent(graphs).map((graph) => graph.id)).toEqual(["new", "old", "none_a", "none_b"]);
  });
});
