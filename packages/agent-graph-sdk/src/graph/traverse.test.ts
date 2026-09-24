import { describe, expect, it } from "vitest";

import { computeFocusNodeIds } from "./traverse.js";

describe("computeFocusNodeIds", () => {
  it("includes the node itself even with no edges", () => {
    expect(computeFocusNodeIds("a", [])).toEqual(new Set(["a"]));
  });

  it("includes ancestors and descendants but not an unrelated parallel branch", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "d" },
      // Unrelated parallel branch.
      { source: "x", target: "y" },
    ];
    expect(computeFocusNodeIds("c", edges)).toEqual(new Set(["a", "b", "c", "d"]));
    expect(computeFocusNodeIds("x", edges)).toEqual(new Set(["x", "y"]));
  });

  it("includes a diamond's shared ancestor and both branches from a downstream node", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "b", target: "d" },
      { source: "c", target: "d" },
    ];
    expect(computeFocusNodeIds("d", edges)).toEqual(new Set(["a", "b", "c", "d"]));
  });
});

describe("computeFocusNodeIds direction", () => {
  const edges = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "x", target: "b" },
  ];
  it("keeps one side only", () => {
    expect(computeFocusNodeIds("b", edges, "downstream")).toEqual(new Set(["b", "c"]));
    expect(computeFocusNodeIds("b", edges, "upstream")).toEqual(new Set(["a", "b", "x"]));
    expect(computeFocusNodeIds("b", edges)).toEqual(new Set(["a", "b", "c", "x"]));
  });
});
