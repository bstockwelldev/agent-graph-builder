import { describe, expect, it } from "vitest";

import { isEdgeDimmed, neighborhoodNodeIds } from "./focusMode";

// The demo graph: two branches out of the router rejoin at the output.
const DEMO_EDGES = [
  ["input_1", "prompt_classify"],
  ["prompt_classify", "llm_classify"],
  ["llm_classify", "router_1"],
  ["router_1", "tool_lookup"],
  ["router_1", "prompt_answer"],
  ["tool_lookup", "output_1"],
  ["prompt_answer", "llm_answer"],
  ["llm_answer", "output_1"],
].map(([source, target]) => ({ source, target }));

describe("focus mode", () => {
  it("lights the selected node and its direct neighbors, both directions", () => {
    expect([...neighborhoodNodeIds("llm_classify", DEMO_EDGES)].sort()).toEqual(["llm_classify", "prompt_classify", "router_1"]);
    expect([...neighborhoodNodeIds("router_1", DEMO_EDGES)].sort()).toEqual(["llm_classify", "prompt_answer", "router_1", "tool_lookup"]);
  });

  it("widens by hops", () => {
    expect(neighborhoodNodeIds("llm_classify", DEMO_EDGES, 2)).toEqual(
      new Set(["llm_classify", "prompt_classify", "router_1", "input_1", "tool_lookup", "prompt_answer"]),
    );
    expect(neighborhoodNodeIds("lonely", DEMO_EDGES)).toEqual(new Set(["lonely"]));
  });

  it("dims an edge unless both ends are lit", () => {
    const lit = neighborhoodNodeIds("llm_classify", DEMO_EDGES);
    expect(isEdgeDimmed({ source: "prompt_classify", target: "llm_classify" }, lit)).toBe(false);
    expect(isEdgeDimmed({ source: "router_1", target: "tool_lookup" }, lit)).toBe(true);
    expect(isEdgeDimmed({ source: "router_1", target: "tool_lookup" }, null)).toBe(false);
  });
});
