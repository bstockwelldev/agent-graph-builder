import { describe, expect, it } from "vitest";

import {
  agentProfileSchema,
  capabilityMatrixSchema,
  chatSessionSchema,
  diagnosticSchema,
  edgeTransformSchema,
  graphDefinitionSchema,
  graphEdgeSchema,
  graphNodeSchema,
  graphPortSchema,
  graphReleaseSchema,
  portContractSchema,
  releaseDiffSchema,
  runGraphSnapshotSchema,
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

// P0 graph foundation, Slice B (docs/planning/features/p0-graph-foundation-design-plan.md):
// backend/app/contracts.py populates category/port_id on real diagnostics —
// this locks the SDK's already-existing (Slice A) schema against the exact
// shapes the contract pass now emits.
describe("diagnosticSchema (Slice B contract diagnostics)", () => {
  it("parses a blocking contract diagnostic with category and port_id", () => {
    const diagnostic = {
      severity: "error",
      code: "EDGE_CONTRACT_KIND_INCOMPATIBLE",
      node_id: "n2",
      edge_id: "e1",
      port_id: "input",
      message: "incompatible port kinds",
      blocking: true,
      category: "contract",
    };
    expect(diagnosticSchema.safeParse(diagnostic).success).toBe(true);
  });

  it("parses a non-blocking inferred-mismatch warning", () => {
    const diagnostic = {
      severity: "warning",
      code: "CONTRACT_KIND_INFERRED_MISMATCH",
      node_id: "n2",
      edge_id: "e1",
      port_id: "input",
      message: "inferred contract mismatch",
      blocking: false,
      category: "contract",
    };
    expect(diagnosticSchema.safeParse(diagnostic).success).toBe(true);
  });

  it("still parses a legacy structural diagnostic with none of the new fields", () => {
    const diagnostic = {
      severity: "error",
      code: "GRAPH_MISSING_ENTRY_NODE",
      message: "no entry node",
      blocking: true,
    };
    expect(diagnosticSchema.safeParse(diagnostic).success).toBe(true);
  });

  it("rejects an unknown category value", () => {
    const diagnostic = {
      severity: "error",
      code: "X",
      message: "x",
      blocking: true,
      category: "not_a_category",
    };
    expect(diagnosticSchema.safeParse(diagnostic).success).toBe(false);
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

// P0 graph foundation, Slice C (docs/planning/features/p0-graph-foundation-design-plan.md).
describe("graphReleaseSchema", () => {
  const graph = {
    id: "g1",
    name: "Demo",
    entry_node_id: "n1",
    nodes: [{ id: "n1", type: "input", position: { x: 0, y: 0 }, config: {} }],
    edges: [],
  };

  it("accepts a well-formed release with empty resource_snapshots/diagnostics", () => {
    const release = {
      id: "rel_1",
      graph_id: "g1",
      graph,
      document_fingerprint: "a".repeat(64),
      semantic_fingerprint: "b".repeat(64),
      resource_snapshots: {},
      release_notes: null,
      author: null,
      created_at: "2026-01-01T00:00:00Z",
      diagnostics: [],
    };
    expect(graphReleaseSchema.safeParse(release).success).toBe(true);
  });

  it("accepts populated resource_snapshots keyed '{kind}:{id}'", () => {
    const release = {
      id: "rel_1",
      graph_id: "g1",
      graph,
      document_fingerprint: "a".repeat(64),
      semantic_fingerprint: "b".repeat(64),
      resource_snapshots: { "tools:custom_tool": { id: "custom_tool", description: "d" } },
      created_at: "2026-01-01T00:00:00Z",
      diagnostics: [],
    };
    expect(graphReleaseSchema.safeParse(release).success).toBe(true);
  });

  it("rejects a release missing semantic_fingerprint", () => {
    const release = {
      id: "rel_1",
      graph_id: "g1",
      graph,
      document_fingerprint: "a".repeat(64),
      resource_snapshots: {},
      created_at: "2026-01-01T00:00:00Z",
      diagnostics: [],
    };
    expect(graphReleaseSchema.safeParse(release).success).toBe(false);
  });
});

describe("capabilityMatrixSchema", () => {
  it("accepts the LangGraph P0 capability matrix shape", () => {
    const matrix = {
      target_id: "langgraph",
      capabilities: [
        { feature: "current_12_executors", supported: true, notes: "Uses existing executor registry." },
        { feature: "target_specific_extension_nodes", supported: false, notes: null },
      ],
    };
    expect(capabilityMatrixSchema.safeParse(matrix).success).toBe(true);
  });

  it("rejects a capability entry missing the required supported field", () => {
    const matrix = { target_id: "langgraph", capabilities: [{ feature: "x" }] };
    expect(capabilityMatrixSchema.safeParse(matrix).success).toBe(false);
  });
});

// P1 rollout plan, Slice A ("Semantic release comparison").
describe("releaseDiffSchema", () => {
  it("accepts an identical-releases diff with no changes", () => {
    const diff = {
      from_release_id: "rel_1",
      to_release_id: "rel_1",
      from_semantic_fingerprint: "a".repeat(64),
      to_semantic_fingerprint: "a".repeat(64),
      identical: true,
      node_changes: [],
      edge_changes: [],
      resource_changes: [],
    };
    expect(releaseDiffSchema.safeParse(diff).success).toBe(true);
  });

  it("accepts added/removed/modified element changes", () => {
    const diff = {
      from_release_id: "rel_1",
      to_release_id: "rel_2",
      from_semantic_fingerprint: "a".repeat(64),
      to_semantic_fingerprint: "b".repeat(64),
      identical: false,
      node_changes: [
        { id: "n1", change: "modified", fields: { config: { from: {}, to: { extra: "x" } } } },
        { id: "n2", change: "added", fields: {} },
      ],
      edge_changes: [{ id: "e1", change: "removed", fields: {} }],
      resource_changes: [],
    };
    expect(releaseDiffSchema.safeParse(diff).success).toBe(true);
  });

  it("rejects an unknown change discriminant", () => {
    const diff = {
      from_release_id: "rel_1",
      to_release_id: "rel_2",
      from_semantic_fingerprint: "a".repeat(64),
      to_semantic_fingerprint: "b".repeat(64),
      identical: false,
      node_changes: [{ id: "n1", change: "renamed", fields: {} }],
      edge_changes: [],
      resource_changes: [],
    };
    expect(releaseDiffSchema.safeParse(diff).success).toBe(false);
  });
});

// P0 graph foundation, Slice D (docs/planning/features/p0-graph-foundation-design-plan.md).
describe("runSummarySchema (Slice D run identity fields)", () => {
  it("still parses a legacy run with none of the new identity fields", () => {
    const run = { run_id: "r1", graph_id: "g1", status: "succeeded", result: null };
    expect(runSummarySchema.safeParse(run).success).toBe(true);
  });

  it("accepts a run with the full GraphRunIdentity fields populated", () => {
    const run = {
      run_id: "r1",
      graph_id: "g1",
      status: "succeeded",
      result: null,
      graph_release_id: "rel_1",
      graph_fingerprint: "a".repeat(64),
      source: "release",
      runtime_target: "langgraph",
      compiler_version: "langgraph-p0.1",
    };
    expect(runSummarySchema.safeParse(run).success).toBe(true);
  });

  it("rejects an unknown source value", () => {
    const run = { run_id: "r1", graph_id: "g1", status: "succeeded", result: null, source: "made_up" };
    expect(runSummarySchema.safeParse(run).success).toBe(false);
  });
});

describe("runGraphSnapshotSchema", () => {
  const graph = {
    id: "g1",
    name: "Demo",
    entry_node_id: "n1",
    nodes: [{ id: "n1", type: "input", position: { x: 0, y: 0 }, config: {} }],
    edges: [],
  };

  it("accepts a draft-sourced snapshot with an embedded graph and resource_snapshots", () => {
    const snapshot = {
      run_id: "run_1",
      graph_id: "g1",
      source: "draft_snapshot",
      graph_fingerprint: "a".repeat(64),
      release_id: null,
      graph,
      resource_snapshots: {},
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(runGraphSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("accepts a release-sourced snapshot with graph/resource_snapshots omitted", () => {
    const snapshot = {
      run_id: "run_1",
      graph_id: "g1",
      source: "release",
      graph_fingerprint: "a".repeat(64),
      release_id: "rel_1",
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(runGraphSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("rejects a snapshot missing the required graph_fingerprint", () => {
    const snapshot = {
      run_id: "run_1",
      graph_id: "g1",
      source: "draft_snapshot",
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(runGraphSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});
