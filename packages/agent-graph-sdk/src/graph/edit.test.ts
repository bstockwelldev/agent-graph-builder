import { describe, expect, it } from "vitest";

import type { GraphDefinition } from "../types.js";
import { addNode, connect, relabel, removeNode, setConfig } from "./edit.js";
import { downstream, hasCycle, reachableFrom, upstream } from "./traverse.js";
import { validateStructure } from "./validate.js";

const empty: GraphDefinition = { id: "g", name: "G", entry_node_id: "input_1", nodes: [], edges: [] };

function linear(): GraphDefinition {
  let graph = addNode(empty, { type: "input" });
  graph = addNode(graph, { type: "prompt" });
  graph = addNode(graph, { type: "output" });
  graph = connect(graph, { source: "input_1", target: "prompt_1" });
  return connect(graph, { source: "prompt_1", target: "output_1" });
}

describe("immutable edits", () => {
  it("builds a valid graph without mutating its inputs", () => {
    const graph = linear();
    expect(empty.nodes).toEqual([]);
    expect(graph.nodes.map((n) => [n.id, n.config])).toEqual([
      ["input_1", { variableName: "question" }],
      ["prompt_1", { template: "{question}" }],
      ["output_1", {}],
    ]);
    expect(graph.edges.map((e) => [e.id, e.source, e.target, e.kind])).toEqual([
      ["edge_1", "input_1", "prompt_1", "sequence"],
      ["edge_2", "prompt_1", "output_1", "sequence"],
    ]);
    expect(validateStructure(graph)).toEqual([]);
  });

  it("removes a node with its edges and group membership", () => {
    const grouped = { ...linear(), groups: [{ id: "grp", label: "G", node_ids: ["prompt_1", "output_1"] }] };
    const next = removeNode(grouped, "prompt_1");
    expect(next.nodes.map((n) => n.id)).toEqual(["input_1", "output_1"]);
    expect(next.edges).toEqual([]);
    expect(next.groups?.[0].node_ids).toEqual(["output_1"]);
    expect(grouped.nodes).toHaveLength(3);
  });

  it("merges, replaces and clears config; relabels", () => {
    const graph = setConfig(linear(), "prompt_1", { template: "Hi {name}", extra: 1 });
    expect(graph.nodes[1].config).toEqual({ template: "Hi {name}", extra: 1 });
    expect(setConfig(graph, "prompt_1", { extra: undefined }).nodes[1].config).toEqual({ template: "Hi {name}" });
    expect(setConfig(graph, "prompt_1", { a: 1 }, { replace: true }).nodes[1].config).toEqual({ a: 1 });
    const named = relabel(graph, "prompt_1", "Greeter");
    expect(named.nodes[1].extensions).toEqual({ label: "Greeter" });
    expect(relabel(named, "prompt_1", " ").nodes[1].extensions).toBeUndefined();
  });

  it("rejects unknown nodes and duplicate ids", () => {
    const graph = linear();
    expect(() => connect(graph, { source: "input_1", target: "ghost" })).toThrow(/No node "ghost"/);
    expect(() => addNode(graph, { id: "prompt_1", type: "prompt" })).toThrow(/already exists/);
    expect(() => connect(graph, { id: "edge_1", source: "input_1", target: "output_1" })).toThrow(/already exists/);
    expect(() => setConfig(graph, "ghost", {})).toThrow();
  });
});

describe("traversal", () => {
  it("walks upstream, downstream and from the entry node; detects cycles", () => {
    const graph = addNode(linear(), { id: "island", type: "prompt" });
    expect(downstream(graph, "input_1")).toEqual(new Set(["prompt_1", "output_1"]));
    expect(upstream(graph, "output_1")).toEqual(new Set(["input_1", "prompt_1"]));
    expect(reachableFrom(graph)).toEqual(new Set(["input_1", "prompt_1", "output_1"]));
    expect(reachableFrom(graph, "ghost")).toEqual(new Set());
    expect(hasCycle(graph)).toBe(false);
    const cyclic = connect(graph, { source: "output_1", target: "input_1" });
    expect(hasCycle(cyclic)).toBe(true);
    // A cycle leads back to the start node, so callers wanting strict ancestors filter it out.
    expect(upstream(cyclic, "prompt_1")).toEqual(new Set(["input_1", "output_1", "prompt_1"]));
  });
});
