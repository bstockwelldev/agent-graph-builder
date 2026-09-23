import { describe, expect, it } from "vitest";

import { formatRunInputs, recentInputValues, runInputVariables } from "./runInputs";

const node = (nodeType: string, config: Record<string, unknown> = {}) => ({ data: { nodeType, config, label: "" } }) as never;

// studio-graph-workbench-redesign-plan.md, Wave 2.5.
describe("runInputVariables", () => {
  it("collects distinct input-node variable names in order", () => {
    expect(
      runInputVariables([node("input", { variableName: "topic" }), node("llm"), node("input", { variableName: "audience" }), node("input", { variableName: "topic" })]),
    ).toEqual(["topic", "audience"]);
  });

  it("defaults blank names and empty graphs to question", () => {
    expect(runInputVariables([node("input", { variableName: " " })])).toEqual(["question"]);
    expect(runInputVariables([node("llm")])).toEqual(["question"]);
  });
});

describe("recentInputValues", () => {
  it("returns distinct non-empty values newest first", () => {
    const runs = [{ input: { q: "b" } }, { input: { q: "a" } }, { input: { q: "b" } }, { input: { q: "" } }, { input: {} }];
    expect(recentInputValues(runs, "q")).toEqual(["b", "a"]);
    expect(recentInputValues(runs, "q", 1)).toEqual(["b"]);
  });
});

describe("formatRunInputs", () => {
  it("shows a single value bare and multiple as key: value", () => {
    expect(formatRunInputs({ question: "Hi" })).toBe("Hi");
    expect(formatRunInputs({ topic: "TCP", audience: "kids" })).toBe("topic: TCP · audience: kids");
    expect(formatRunInputs({})).toBe("");
  });
});
