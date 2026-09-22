import { describe, expect, it } from "vitest";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";

import { exportGraphJson, importGraphJson } from "./graphJsonPortability";

const SAMPLE_GRAPH: GraphDefinition = {
  id: "graph_1",
  name: "Sample",
  entry_node_id: "input_1",
  nodes: [
    { id: "input_1", type: "input", position: { x: 0, y: 0 }, config: { variableName: "question" } },
    { id: "output_1", type: "output", position: { x: 200, y: 0 }, config: {} },
  ],
  edges: [{ id: "edge_1", source: "input_1", target: "output_1", kind: "sequence", condition: null }],
  orientation: "auto",
};

describe("exportGraphJson / importGraphJson", () => {
  it("round-trips a valid graph without data loss", () => {
    const json = exportGraphJson(SAMPLE_GRAPH);
    const result = importGraphJson(json);
    expect(result).toEqual({ ok: true, graph: SAMPLE_GRAPH });
  });

  it("rejects malformed JSON", () => {
    const result = importGraphJson("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Invalid JSON/);
  });

  it("rejects JSON that doesn't match the graph schema", () => {
    const result = importGraphJson('{"id": "x"}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Not a valid graph/);
  });

  it("rejects a node with an invalid type", () => {
    const broken = { ...SAMPLE_GRAPH, nodes: [{ ...SAMPLE_GRAPH.nodes[0], type: "not_a_real_type" }] };
    const result = importGraphJson(JSON.stringify(broken));
    expect(result.ok).toBe(false);
  });
});
