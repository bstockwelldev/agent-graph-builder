import { describe, expect, it } from "vitest";
import { recordedModelLine, recordedModelOf } from "./recordedModel";

describe("recordedModelOf", () => {
  it("reads provider, model and source from a trace input", () => {
    expect(recordedModelOf({ provider: "groq", model: "m", modelSource: "run", userPrompt: "x" })).toEqual({
      provider: "groq",
      model: "m",
      source: "run",
    });
  });

  it("tolerates traces recorded before the source was captured", () => {
    expect(recordedModelOf({ provider: "stub", model: "stub" })).toEqual({ provider: "stub", model: "stub", source: null });
  });

  it("ignores an unknown source and malformed input", () => {
    expect(recordedModelOf({ provider: "stub", model: "m", modelSource: "???" })?.source).toBeNull();
    expect(recordedModelOf(null)).toBeNull();
    expect(recordedModelOf({ provider: "stub" })).toBeNull();
    expect(recordedModelOf({ provider: "", model: "m" })).toBeNull();
  });
});

describe("recordedModelLine", () => {
  it.each([
    ["run", "groq · m: set in the Run panel"],
    ["profile", "groq · m: from the node's LLM profile"],
    ["pin", "groq · m: the node's model pin"],
    ["default", "groq · m: the provider's default model"],
    ["override", "groq · m: a replay override"],
  ] as const)("explains source %s", (source, line) => {
    expect(recordedModelLine({ provider: "groq", model: "m", source })).toBe(line);
  });

  it("shows only provider and model when the source is unknown", () => {
    expect(recordedModelLine({ provider: "groq", model: "m", source: null })).toBe("groq · m");
  });
});
