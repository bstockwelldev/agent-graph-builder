import { describe, expect, it } from "vitest";
import type { NodeType } from "@bstockwelldev/agent-graph-sdk";

import { defaultConfig, summaryFor } from "./nodeDefaults";

describe("summaryFor", () => {
  it("shows the provider for llm and tool_loop nodes", () => {
    expect(summaryFor("llm", { provider: "groq" })).toBe("via groq");
    expect(summaryFor("tool_loop", { provider: "groq", maxToolIterations: 8 })).toBe(
      "via groq · max 8 iterations",
    );
  });

  it("defaults to ollama when no provider is set", () => {
    expect(summaryFor("llm", {})).toBe("via ollama");
  });

  it("shows the input variable for tool nodes", () => {
    expect(summaryFor("tool", { inputVariable: "topic" })).toBe("input: topic");
  });

  it("humanizes boolean config for guardrail and rubric nodes", () => {
    expect(summaryFor("guardrail", { allowUrls: true })).toBe("Allows URLs");
    expect(summaryFor("guardrail", { allowUrls: false })).toBe("Blocks URLs");
    expect(summaryFor("rubric", { rubricFailOnFindings: true })).toBe("Fails run on findings");
    expect(summaryFor("rubric", { rubricFailOnFindings: false })).toBe("Findings don't fail the run");
  });

  it("returns null for node types with no second field worth surfacing", () => {
    expect(summaryFor("input", { variableName: "question" })).toBeNull();
    expect(summaryFor("prompt", { template: "{question}" })).toBeNull();
    expect(summaryFor("router", {})).toBeNull();
    expect(summaryFor("output", {})).toBeNull();
    expect(summaryFor("branch", { content: "yes" })).toBeNull();
    expect(summaryFor("code_exec", { codeExecLanguage: "python" })).toBeNull();
    expect(summaryFor("human_gate", { content: "Approve?" })).toBeNull();
  });
});

describe("defaultConfig", () => {
  // Regression test: backend/app/node_configs.py's typed config models
  // declare these fields `Field(min_length=1)`. A freshly-added node's
  // config comes straight from defaultConfig() before the user edits
  // anything -- if a required field defaults to "", the node is invalid
  // the instant it's created (human_gate and code_exec both did this;
  // "content: String should have at least 1 character" was a blocking
  // compile error on a brand-new, untouched node). Every node type in
  // this table must keep a non-empty default for the listed fields.
  const REQUIRED_NON_EMPTY_FIELDS: Partial<Record<NodeType, readonly string[]>> = {
    tool_loop: ["model"],
    code_exec: ["content"],
    human_gate: ["content"],
  };

  for (const [type, fields] of Object.entries(REQUIRED_NON_EMPTY_FIELDS) as [
    NodeType,
    readonly string[],
  ][]) {
    it(`gives a non-empty default ${type}.${fields.join("/")}`, () => {
      const config = defaultConfig(type);
      for (const field of fields) {
        expect(typeof config[field]).toBe("string");
        expect((config[field] as string).length).toBeGreaterThan(0);
      }
    });
  }

  it("keeps tool_loop's maxToolIterations within the backend's 1-64 range", () => {
    const config = defaultConfig("tool_loop");
    expect(config.maxToolIterations).toBeGreaterThanOrEqual(1);
    expect(config.maxToolIterations).toBeLessThanOrEqual(64);
  });
});
