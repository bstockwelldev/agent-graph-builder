import { describe, expect, it } from "vitest";

import { flowEdgeLabel, shouldRunDagre } from "./graphAuthoring";

// studio-graph-workbench-redesign-plan.md, Slice 6.
describe("flowEdgeLabel", () => {
  it("omits a label for sequence edges", () => {
    expect(flowEdgeLabel("sequence", null)).toBeNull();
  });

  it("labels conditional edges with their condition and fallback edges as fallback", () => {
    expect(flowEdgeLabel("conditional", "  billing ")).toBe("if: billing");
    expect(flowEdgeLabel("default", null)).toBe("fallback");
  });
});

// Slice 5: opening a graph keeps its saved positions unless they can't be trusted.
describe("shouldRunDagre", () => {
  const base = { rankDirChanged: false, graphIdChanged: false, relayoutRequested: false, topologyChanged: false };

  it("always runs on an explicit relayout", () => {
    expect(shouldRunDagre({ ...base, relayoutRequested: true, initialLayoutNeeded: false })).toBe(true);
  });

  it("runs on graph load only when the initial layout is needed", () => {
    expect(shouldRunDagre({ ...base, graphIdChanged: true, initialLayoutNeeded: false })).toBe(false);
    expect(shouldRunDagre({ ...base, graphIdChanged: true, initialLayoutNeeded: true })).toBe(true);
  });

  it("runs when the effective direction changes", () => {
    expect(shouldRunDagre({ ...base, rankDirChanged: true })).toBe(true);
    expect(shouldRunDagre(base)).toBe(false);
  });
});
