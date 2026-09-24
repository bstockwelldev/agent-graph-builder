import { describe, expect, it } from "vitest";

import { buildReplayRequest, compareNodes, modelChoices, routeChoices } from "./counterfactual.js";

const graph = {
  nodes: [
    { id: "llm_classify", type: "llm", config: { model: "qwen" } },
    { id: "router_1", type: "router", config: {} },
    { id: "tool_lookup", type: "tool", config: {} },
    { id: "prompt_answer", type: "prompt", config: {} },
  ],
  edges: [
    { id: "e1", source: "llm_classify", target: "router_1" },
    { id: "e2", source: "router_1", target: "tool_lookup" },
    { id: "e3", source: "router_1", target: "prompt_answer" },
  ],
} as never;

describe("counterfactual choices", () => {
  it("lists router targets and swappable model nodes", () => {
    expect(routeChoices(graph)).toEqual([{ nodeId: "router_1", targets: ["tool_lookup", "prompt_answer"] }]);
    expect(modelChoices(graph)).toEqual([{ nodeId: "llm_classify", recordedModel: "qwen" }]);
  });

  it("builds a request only from real changes", () => {
    expect(buildReplayRequest({ routes: { router_1: "" }, models: { llm_classify: { provider: "", model: "x" } }, liveAffected: true })).toBeNull();
    expect(
      buildReplayRequest({ routes: { router_1: "prompt_answer" }, models: { llm_classify: { provider: "groq", model: "  " } }, liveAffected: false }),
    ).toEqual({
      forced_routes: { router_1: "prompt_answer" },
      model_overrides: { llm_classify: { provider: "groq", model: null } },
      live_affected: false,
    });
  });
});

describe("compareNodes", () => {
  it("pairs outputs and marks branch-only nodes", () => {
    const trace = (node_id: string, output: unknown) => ({ node_id, output }) as never;
    const rows = compareNodes(
      [trace("router_1", "a"), trace("tool_lookup", "t")],
      [trace("router_1", "b"), trace("prompt_answer", "p")],
      { router_1: "forced", prompt_answer: "recomputed" },
      ["router_1", "tool_lookup", "prompt_answer"],
    );
    expect(rows.map((r) => [r.nodeId, r.mode, r.onlyIn, r.changed])).toEqual([
      ["router_1", "forced", null, true],
      ["prompt_answer", "recomputed", "replay", true],
      ["tool_lookup", null, "original", true],
    ]);
  });
});
