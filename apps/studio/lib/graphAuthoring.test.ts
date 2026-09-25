import { describe, expect, it } from "vitest";

import { copyGraphDefinition, edgeContract, flowEdgeLabel, nodePorts, shouldRunDagre } from "./graphAuthoring";

// studio-graph-workbench-redesign-plan.md, Slice 6.
describe("flowEdgeLabel", () => {
  it("omits a label for sequence edges", () => {
    expect(flowEdgeLabel("sequence", null)).toBeNull();
  });

  it("labels conditional edges with their condition and fallback edges as fallback", () => {
    expect(flowEdgeLabel("conditional", "  billing ")).toBe("if: billing");
    expect(flowEdgeLabel("default", null)).toBe("fallback");
  });
});

// Slice 5: opening a graph keeps its saved positions unless they can't be trusted.
describe("shouldRunDagre", () => {
  const base = { rankDirChanged: false, graphIdChanged: false, relayoutRequested: false, topologyChanged: false };

  it("always runs on an explicit relayout", () => {
    expect(shouldRunDagre({ ...base, relayoutRequested: true, initialLayoutNeeded: false })).toBe(true);
  });

  it("runs on graph load only when the initial layout is needed", () => {
    expect(shouldRunDagre({ ...base, graphIdChanged: true, initialLayoutNeeded: false })).toBe(false);
    expect(shouldRunDagre({ ...base, graphIdChanged: true, initialLayoutNeeded: true })).toBe(true);
  });

  it("runs when the effective direction changes", () => {
    expect(shouldRunDagre({ ...base, rankDirChanged: true })).toBe(true);
    expect(shouldRunDagre(base)).toBe(false);
  });
});

describe("contract round-trip", () => {
  it("keeps author-declared node ports and omits empty ones", () => {
    const port = { id: "in", name: "in", direction: "input" as const, contract: { kind: "message" as const } };
    const base = { id: "n", type: "llm" as const, position: { x: 0, y: 0 }, config: {} };
    expect(nodePorts({ ...base, input_ports: [port], output_ports: [] })).toEqual({ input_ports: [port] });
    expect(nodePorts(base)).toBeUndefined();
  });

  it("keeps edge ports and transform so a save never strips them", () => {
    const base = { id: "e", source: "a", target: "b", kind: "sequence" as const };
    const transform = { type: "format_message" as const, template: "{value}" };
    expect(edgeContract({ ...base, target_port: "input", transform })).toEqual({ target_port: "input", transform });
    expect(edgeContract(base)).toBeUndefined();
  });
});

describe("copyGraphDefinition", () => {
  it("keeps the graph under a fresh backend-shaped id and a copy name", () => {
    const graph = { id: "demo_classify_and_route", name: "Classify & Route (demo)", entry_node_id: "input_1", nodes: [], edges: [] };
    const copy = copyGraphDefinition(graph, () => "0123456789ab");
    expect(copy).toEqual({ ...graph, id: "graph_0123456789ab", name: "Classify & Route (demo) (copy)" });
  });

  it("mints a different id each time by default", () => {
    const graph = { id: "g", name: "G", entry_node_id: "a", nodes: [], edges: [] };
    const ids = new Set([copyGraphDefinition(graph).id, copyGraphDefinition(graph).id]);
    expect(ids.size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^graph_[0-9a-f]{12}$/);
  });
});
