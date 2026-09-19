import { describe, expect, it } from "vitest";

import {
  agentProfileSchema,
  chatSessionSchema,
  edgeTransformSchema,
  graphDefinitionSchema,
  graphEdgeSchema,
  graphNodeSchema,
  graphPortSchema,
  portContractSchema,
  runSummarySchema,
} from "./schemas.js";

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

// P0 graph foundation, Slice A (docs/planning/features/p0-graph-foundation-design-plan.md).
describe("graphNodeSchema / graphEdgeSchema (Slice A port/contract fields)", () => {
  it("still parses a legacy node/edge with none of the new fields present", () => {
    const node = { id: "n1", type: "input", position: { x: 0, y: 0 }, config: {} };
    const edge = { id: "e1", source: "n1", target: "n2", kind: "sequence" };
    expect(graphNodeSchema.safeParse(node).success).toBe(true);
    expect(graphEdgeSchema.safeParse(edge).success).toBe(true);
  });

  it("parses a node/edge with the new port/transform fields present", () => {
    const node = {
      id: "n1",
      type: "llm",
      position: { x: 0, y: 0 },
      config: {},
      input_ports: [{ id: "input", name: "input", direction: "input", contract: { kind: "message" } }],
      output_ports: [{ id: "output", name: "output", direction: "output", contract: { kind: "message" } }],
      extensions: { langgraph: {} },
    };
    const edge = {
      id: "e1",
      source: "n1",
      target: "n2",
      kind: "sequence",
      source_port: "output",
      target_port: "input",
      transform: { type: "select", pointer: "/foo" },
      extensions: {},
    };
    expect(graphNodeSchema.safeParse(node).success).toBe(true);
    expect(graphEdgeSchema.safeParse(edge).success).toBe(true);
  });

  it("rejects a port contract with an unknown kind", () => {
    const contract = { kind: "not_a_port_kind" };
    expect(portContractSchema.safeParse(contract).success).toBe(false);
  });

  it("accepts a port contract with only the required kind field", () => {
    expect(portContractSchema.safeParse({ kind: "message" }).success).toBe(true);
  });

  it("rejects a graph port with an invalid direction", () => {
    const port = { id: "p1", name: "p1", direction: "sideways", contract: { kind: "message" } };
    expect(graphPortSchema.safeParse(port).success).toBe(false);
  });

  it("rejects an edge transform with an unknown type", () => {
    expect(edgeTransformSchema.safeParse({ type: "not_a_transform" }).success).toBe(false);
  });

  it("accepts an edge transform with only the required type field", () => {
    expect(edgeTransformSchema.safeParse({ type: "coerce" }).success).toBe(true);
  });
});

describe("chatSessionSchema", () => {
  it("accepts a session with an empty message history", () => {
    const session = {
      id: "chat1",
      title: "Scratchpad",
      provider: "stub",
      model: "stub",
      messages: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(chatSessionSchema.safeParse(session).success).toBe(true);
  });

  it("rejects a message with a role outside user/assistant", () => {
    const session = {
      id: "chat1",
      title: "Scratchpad",
      provider: "stub",
      model: "stub",
      messages: [{ role: "system", content: "hi", created_at: "2026-01-01T00:00:00Z" }],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(chatSessionSchema.safeParse(session).success).toBe(false);
  });
});
