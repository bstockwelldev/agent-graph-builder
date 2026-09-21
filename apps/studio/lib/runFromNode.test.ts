import { describe, expect, it } from "vitest";

import { computeAncestorNodeIds } from "./runFromNode";

describe("computeAncestorNodeIds", () => {
  it("returns every upstream node in a linear chain", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "d" },
    ];
    expect(computeAncestorNodeIds("d", edges).sort()).toEqual(["a", "b", "c"]);
  });

  it("dedupes a shared ancestor reached via two branches", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "b", target: "d" },
      { source: "c", target: "d" },
    ];
    expect(computeAncestorNodeIds("d", edges).sort()).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for a node with no incoming edges", () => {
    const edges = [{ source: "a", target: "b" }];
    expect(computeAncestorNodeIds("a", edges)).toEqual([]);
  });

  it("never includes the node itself even if a cycle exists", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "a" },
    ];
    expect(computeAncestorNodeIds("a", edges)).toEqual(["b"]);
  });
});
