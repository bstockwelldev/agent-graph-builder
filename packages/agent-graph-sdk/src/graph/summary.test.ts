import { describe, expect, it } from "vitest";

import type { GraphDefinition } from "../types.js";
import { summarizeGraph } from "./summary.js";

describe("summarizeGraph", () => {
  it("matches the backend's catalog summary", () => {
    const graph = {
      id: "g",
      name: "G",
      entry_node_id: "in",
      nodes: [
        { id: "in", type: "input", position: { x: 0, y: 0 }, config: { variableName: "topic" } },
        { id: "s1", type: "subgraph", position: { x: 0, y: 0 }, config: { graphId: "child" } },
        { id: "s2", type: "subgraph", position: { x: 0, y: 0 }, config: { graphId: "child" } },
        { id: "s3", type: "subgraph", position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [{ id: "e", source: "in", target: "s1" }],
    } as GraphDefinition;
    expect(summarizeGraph(graph)).toEqual({
      id: "g",
      name: "G",
      updated_at: null,
      node_count: 4,
      edge_count: 1,
      input_variables: ["topic"],
      subgraph_ids: ["child"],
    });
  });
});
