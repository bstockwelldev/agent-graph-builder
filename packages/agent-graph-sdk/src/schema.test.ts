import { describe, expect, it } from "vitest";

import {
  documentFingerprint,
  fingerprintGraph,
  fingerprintGraphSemantics,
  isNodeType,
  NODE_TYPES,
  semanticFingerprint,
} from "./schema.js";
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

// P0 graph foundation, Slice A (docs/planning/features/p0-graph-foundation-design-plan.md).
// fingerprintGraph/fingerprintGraphSemantics above are apps/studio's
// existing synchronous local dirty-check helpers — this block is a
// regression guard that Slice A left them untouched (still exported,
// still non-hashed JSON strings), alongside the new hashed functions.
describe("fingerprintGraph / fingerprintGraphSemantics are unchanged", () => {
  it("still return non-hashed JSON strings, not digests", () => {
    const graph = sampleGraph();
    expect(fingerprintGraph(graph)).toContain('"id":"graph-1"');
    expect(fingerprintGraphSemantics(graph)).toContain('"id":"graph-1"');
    expect(fingerprintGraph(graph)).not.toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("documentFingerprint / semanticFingerprint", () => {
  it("are deterministic", () => {
    const graph = sampleGraph();
    expect(documentFingerprint(graph)).toBe(documentFingerprint(graph));
    expect(semanticFingerprint(graph)).toBe(semanticFingerprint(graph));
  });

  it("returns a 64-character hex SHA-256 digest", () => {
    const graph = sampleGraph();
    expect(documentFingerprint(graph)).toMatch(/^[0-9a-f]{64}$/);
    expect(semanticFingerprint(graph)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("semanticFingerprint ignores node position; documentFingerprint does not", () => {
    const left = sampleGraph(0);
    const right = sampleGraph(500);

    expect(semanticFingerprint(left)).toBe(semanticFingerprint(right));
    expect(documentFingerprint(left)).not.toBe(documentFingerprint(right));
  });

  it("locks the hash algorithm against a fixture shared with the backend's test_fingerprint.py", () => {
    // Same literal graph as backend/tests/test_fingerprint.py's
    // test_document_fingerprint_locks_the_hash_algorithm — the design
    // doc's Risks table asks for a cross-wire fixture without needing code
    // generation; identical expected digests on both sides prove the two
    // canonical-JSON + SHA-256 implementations genuinely agree.
    const graph: GraphDefinition = {
      id: "fixture_graph",
      name: "Fixture",
      entry_node_id: "n1",
      orientation: "auto",
      nodes: [
        {
          id: "n1",
          type: "input",
          position: { x: 1, y: 2 },
          config: { a: 1 },
        },
      ],
      edges: [],
    };
    expect(documentFingerprint(graph)).toBe(
      "73915e32970cff35d8586c629f3db9bc375150c2c7471bfe478da3e31ec75f41",
    );
    expect(semanticFingerprint(graph)).toBe(
      "fa21e31b4554e37aade554411779cde27352719980c0fa1042c7d64508119a77",
    );
  });

  // studio-graph-workbench-redesign-plan.md, Slice 4 -- same fixtures and
  // digests as backend/tests/test_fingerprint.py's
  // test_node_label_is_display_only / test_non_display_extensions_stay_semantic.
  const labeledFixture = (extensions?: Record<string, unknown>): GraphDefinition => ({
    id: "fixture_graph",
    name: "Fixture",
    entry_node_id: "n1",
    orientation: "auto",
    nodes: [{ id: "n1", type: "input", position: { x: 1, y: 2 }, config: { a: 1 }, ...(extensions ? { extensions } : {}) }],
    edges: [],
  });

  it("treats a node's extensions.label as display-only, matching the backend", () => {
    const named = labeledFixture({ label: "Named" });
    expect(documentFingerprint(named)).toBe("617d974406f8ad35fc3004dc233d1cd7d66cfb2b5e49219cb1b61381ce74813f");
    expect(semanticFingerprint(named)).toBe("fa21e31b4554e37aade554411779cde27352719980c0fa1042c7d64508119a77");
    expect(semanticFingerprint(labeledFixture({ label: "Renamed" }))).toBe(semanticFingerprint(named));
  });

  it("keeps non-display extension keys semantic, matching the backend", () => {
    expect(semanticFingerprint(labeledFixture({ label: "Named", keep: 1 }))).toBe(
      "adf41fe788bda907e980bbbb35ad6a5f7503b835ba65eed0c872ed5da107febc",
    );
  });

  it("fingerprintGraph (local dirty check) sees a rename", () => {
    expect(fingerprintGraph(labeledFixture({ label: "A" }))).not.toBe(fingerprintGraph(labeledFixture({ label: "B" })));
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
