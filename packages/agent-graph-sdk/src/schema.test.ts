import { describe, expect, it } from "vitest";

import { fingerprintGraph, fingerprintGraphSemantics } from "./schema.js";
import type { GraphDefinition } from "./types.js";

function sampleGraph(positionOffset = 0): GraphDefinition {
  return {
    id: "graph-1",
    name: "Sample",
    entry_node_id: "input-1",
    orientation: "horizontal",
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 40 + positionOffset, y: 80 + positionOffset },
        config: { label: "Start" },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 320 + positionOffset, y: 120 + positionOffset },
        config: { label: "Finish" },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "input-1",
        target: "output-1",
        kind: "sequence",
      },
    ],
  };
}

describe("fingerprintGraphSemantics", () => {
  it("ignores node position while preserving semantic fields", () => {
    const left = sampleGraph(0);
    const right = sampleGraph(500);

    expect(fingerprintGraphSemantics(left)).toBe(fingerprintGraphSemantics(right));
    expect(fingerprintGraph(left)).not.toBe(fingerprintGraph(right));
  });
});
