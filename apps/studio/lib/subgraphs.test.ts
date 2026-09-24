import { describe, expect, it } from "vitest";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";

import { childRunHref, referenceableGraphs, setMappingRow } from "./subgraphs";

// Wave 7c (STO-612): subgraph node helpers.

const graph = (id: string, refs: string[] = []): GraphDefinition => ({
  id,
  name: id.toUpperCase(),
  entry_node_id: "in",
  nodes: refs.map((graphId, i) => ({ id: `sub${i}`, type: "subgraph" as const, position: { x: 0, y: 0 }, config: { graphId } })),
  edges: [],
});

describe("referenceableGraphs", () => {
  it("excludes the current graph and graphs that lead back to it", () => {
    const graphs = [graph("parent", ["a"]), graph("a"), graph("b", ["c"]), graph("c", ["parent"]), graph("d", ["a"])];
    expect(referenceableGraphs(graphs, "parent").map((g) => g.id)).toEqual(["a", "d"]);
  });
});

describe("child interface and mapping", () => {
  it("drops blank rows and collapses an empty mapping to undefined", () => {
    const one = setMappingRow(undefined, "topic", "{question}");
    expect(one).toEqual({ topic: "{question}" });
    expect(setMappingRow(one, "topic", "  ")).toBeUndefined();
  });
});

describe("childRunHref", () => {
  it("links from trace input, or parses a failed child's run id", () => {
    expect(childRunHref({ input: { childRunId: "run_1", graphId: "child" } })).toBe("/graphs/child?run=run_1&panel=run");
    expect(childRunHref({ input: null, error: "child run run_ab12 failed: boom" }, "child")).toBe("/graphs/child?run=run_ab12&panel=run");
    expect(childRunHref({ input: {} }, "child")).toBeNull();
  });
});

