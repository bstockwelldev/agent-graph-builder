import { describe, expect, it } from "vitest";

import { fingerprintGraph, fingerprintGraphSemantics, isNodeType, NODE_TYPES } from "./schema.js";
import type { GraphDefinition, NodeType } from "./types.js";

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

// Studio-consolidation Phase 1 (docs/planning/features/studio-consolidation-plan.md):
// NodeType absorbed six kinds from micro-ui-agent-builder's FlowStep vocabulary.
describe("NODE_TYPES (studio-consolidation Phase 1)", () => {
  const absorbed: NodeType[] = ["guardrail", "rubric", "human_gate", "tool_loop", "code_exec", "branch"];
  const original: NodeType[] = ["input", "prompt", "llm", "tool", "router", "output"];

  it("includes both the original six and the six absorbed node types", () => {
    expect(NODE_TYPES).toHaveLength(12);
    for (const type of [...original, ...absorbed]) {
      expect(NODE_TYPES).toContain(type);
    }
  });

  it("isNodeType recognizes every absorbed type and rejects unknown strings", () => {
    for (const type of absorbed) {
      expect(isNodeType(type)).toBe(true);
    }
    expect(isNodeType("not_a_real_type")).toBe(false);
  });
});
