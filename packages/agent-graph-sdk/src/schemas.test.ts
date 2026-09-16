import { describe, expect, it } from "vitest";

import { agentProfileSchema, graphDefinitionSchema, runSummarySchema } from "./schemas.js";

// Studio-consolidation Phase 4f: direct schema-level coverage, independent
// of the client's jsonFetch rejection-path tests in client.test.ts.
describe("graphDefinitionSchema", () => {
  it("accepts a well-formed graph", () => {
    const graph = {
      id: "g1",
      name: "Demo",
      entry_node_id: "n1",
      nodes: [{ id: "n1", type: "input", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    };
    expect(graphDefinitionSchema.safeParse(graph).success).toBe(true);
  });

  it("rejects a node with an unknown type", () => {
    const graph = {
      id: "g1",
      name: "Demo",
      entry_node_id: "n1",
      nodes: [{ id: "n1", type: "not_a_node_type", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    };
    expect(graphDefinitionSchema.safeParse(graph).success).toBe(false);
  });
});

describe("runSummarySchema", () => {
  it("accepts a paused run with no result yet", () => {
    const run = { run_id: "r1", graph_id: "g1", status: "paused", result: null };
    expect(runSummarySchema.safeParse(run).success).toBe(true);
  });

  it("rejects a run missing graph_id", () => {
    const run = { run_id: "r1", status: "succeeded", result: null };
    expect(runSummarySchema.safeParse(run).success).toBe(false);
  });
});

describe("agentProfileSchema", () => {
  it("requires optional_elements even when other fields are nullish", () => {
    const agent = { id: "a1", name: "Support agent", optional_elements: [] };
    expect(agentProfileSchema.safeParse(agent).success).toBe(true);
  });

  it("rejects a missing optional_elements array", () => {
    const agent = { id: "a1", name: "Support agent" };
    expect(agentProfileSchema.safeParse(agent).success).toBe(false);
  });
});
