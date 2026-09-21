import { describe, expect, it } from "vitest";

import { summaryFor } from "./nodeDefaults";

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
