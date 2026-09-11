import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import type { GraphNodeData } from "../components/nodes/GraphNodeView";
import {
  coachStep,
  flowEdgeLabel,
  hasMinimalRunnablePath,
  isBlankGraphPattern,
  isCoachVisible,
  shouldRunDagre,
} from "./graphAuthoring";

function node(id: string, nodeType: GraphNodeData["nodeType"]): Node<GraphNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { nodeType, label: id, config: {} },
    type: nodeType,
  };
}

function edge(id: string, source: string, target: string, kind = "sequence"): Edge {
  return { id, source, target, data: { kind } };
}

describe("shouldRunDagre", () => {
  it("does not run when only topology (node/edge count) changed", () => {
    expect(
      shouldRunDagre({
        rankDirChanged: false,
        graphIdChanged: false,
        relayoutRequested: false,
        topologyChanged: true,
      }),
    ).toBe(false);
  });

  it("runs when rank dir, graph id, or relayout changes", () => {
    expect(
      shouldRunDagre({
        rankDirChanged: true,
        graphIdChanged: false,
        relayoutRequested: false,
        topologyChanged: false,
      }),
    ).toBe(true);
    expect(
      shouldRunDagre({
        rankDirChanged: false,
        graphIdChanged: true,
        relayoutRequested: false,
        topologyChanged: false,
      }),
    ).toBe(true);
    expect(
      shouldRunDagre({
        rankDirChanged: false,
        graphIdChanged: false,
        relayoutRequested: true,
        topologyChanged: false,
      }),
    ).toBe(true);
  });
});

describe("flowEdgeLabel", () => {
  it("uses Always / Match / Fallback titles instead of schema slugs", () => {
    expect(flowEdgeLabel("sequence", null)).toBe("Always");
    expect(flowEdgeLabel("default", null)).toBe("Fallback");
    expect(flowEdgeLabel("conditional", "technical")).toBe("Match: technical");
  });
});

describe("hasMinimalRunnablePath", () => {
  it("is false for blank input-output", () => {
    const nodes = [node("in", "input"), node("out", "output")];
    const edges = [edge("e1", "in", "out")];
    expect(isBlankGraphPattern(nodes, edges)).toBe(true);
    expect(hasMinimalRunnablePath(nodes, edges)).toBe(false);
  });

  it("is false with prompt only", () => {
    const nodes = [node("in", "input"), node("p", "prompt"), node("out", "output")];
    const edges = [edge("e1", "in", "p"), edge("e2", "p", "out")];
    expect(hasMinimalRunnablePath(nodes, edges)).toBe(false);
  });

  it("is true for input-prompt-llm-output", () => {
    const nodes = [node("in", "input"), node("p", "prompt"), node("l", "llm"), node("out", "output")];
    const edges = [edge("e1", "in", "p"), edge("e2", "p", "l"), edge("e3", "l", "out")];
    expect(hasMinimalRunnablePath(nodes, edges)).toBe(true);
  });
});

describe("coachStep and visibility", () => {
  it("asks for a Prompt on the blank template", () => {
    const nodes = [node("in", "input"), node("out", "output")];
    const edges = [edge("e1", "in", "out")];
    const step = coachStep(nodes, edges);
    expect(step.stepLabel).toContain("1 of 4");
    expect(step.lines[0]).toMatch(/Prompt/i);
    expect(isCoachVisible("g1", false, nodes, edges)).toBe(true);
  });

  it("stays visible after adding a Prompt (not blank anymore)", () => {
    const nodes = [node("in", "input"), node("p", "prompt"), node("out", "output")];
    const edges = [edge("e1", "in", "p"), edge("e2", "p", "out")];
    expect(isBlankGraphPattern(nodes, edges)).toBe(false);
    expect(isCoachVisible("g1", false, nodes, edges)).toBe(true);
    expect(coachStep(nodes, edges).stepLabel).toContain("2 of 4");
  });

  it("hides when dismissed or when a runnable path exists", () => {
    const nodes = [node("in", "input"), node("p", "prompt"), node("l", "llm"), node("out", "output")];
    const edges = [edge("e1", "in", "p"), edge("e2", "p", "l"), edge("e3", "l", "out")];
    expect(isCoachVisible("g1", false, nodes, edges)).toBe(false);
    expect(isCoachVisible("g1", true, [node("in", "input"), node("out", "output")], [edge("e1", "in", "out")])).toBe(
      false,
    );
  });
});
