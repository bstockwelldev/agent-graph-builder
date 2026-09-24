import { describe, expect, it } from "vitest";
import type { NodeType } from "../types.js";

import { boundTitleFor, defaultConfig, labelFor, nodeLabel, summaryFor, templateVariables, versionLabel, withUserLabel } from "./nodes.js";

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
    expect(summaryFor("router", {})).toBeNull();
    expect(summaryFor("branch", { content: "yes" })).toBeNull();
    expect(summaryFor("code_exec", { codeExecLanguage: "python" })).toBeNull();
  });

  // studio-graph-workbench-redesign-plan.md, Slice 4 -- richer summaries.
  it("lists prompt template variables", () => {
    expect(summaryFor("prompt", { template: "Answer {question} about {topic}, {question}" })).toBe("vars: question, topic");
    expect(summaryFor("prompt", { template: "no vars" })).toBeNull();
  });

  it("counts router routes when known", () => {
    expect(summaryFor("router", {}, { routeCount: 3 })).toBe("3 routes");
    expect(summaryFor("router", {}, { routeCount: 1 })).toBe("1 route");
  });

  it("describes output and content-bearing nodes", () => {
    expect(summaryFor("output", {})).toBe("Final result");
    expect(summaryFor("human_gate", { content: "Approve?" })).toBe("Approve?");
    expect(summaryFor("code_exec", { content: "x".repeat(60) })).toHaveLength(40);
  });

  it("moves the title's config field into the summary when the user named the node", () => {
    expect(summaryFor("llm", { provider: "groq", model: "llama-3" }, { hasUserLabel: true })).toBe("groq · llama-3");
    expect(summaryFor("tool", { toolName: "lookup_topic", inputVariable: "q" }, { hasUserLabel: true })).toBe(
      "lookup_topic · input: q",
    );
    expect(summaryFor("input", { variableName: "question" }, { hasUserLabel: true })).toBe("variable: question");
  });
});

describe("templateVariables", () => {
  it("extracts de-duplicated placeholders in order", () => {
    expect(templateVariables("{a} {b} {a} {not valid}")).toEqual(["a", "b"]);
  });
});

describe("nodeLabel / withUserLabel", () => {
  it("prefers a non-blank user label over the derived one", () => {
    expect(nodeLabel("llm", { model: "qwen" }, "Intent classifier")).toBe("Intent classifier");
    expect(nodeLabel("llm", { model: "qwen" }, "  ")).toBe("qwen");
    expect(nodeLabel("llm", { model: "qwen" })).toBe("qwen");
  });

  it("sets, trims, and removes the label without leaving an empty extensions object", () => {
    expect(withUserLabel(undefined, " Classifier ")).toEqual({ label: "Classifier" });
    expect(withUserLabel({ label: "Old" }, "")).toBeUndefined();
    expect(withUserLabel({ label: "Old", other: 1 }, null)).toEqual({ other: 1 });
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

  it("summarizes library-bound nodes by resource name (Wave 4a)", () => {
    const names = { "prompts:p1": "Explain", "llm_profiles:lp": "Fast" };
    expect(summaryFor("prompt", { promptId: "p1", template: "{x}" }, { resourceNames: names })).toBe("Library prompt");
    expect(summaryFor("prompt", { promptId: "p1" }, { hasUserLabel: true, resourceNames: names })).toBe("Library · Explain");
    expect(summaryFor("llm", { llmProfileId: "lp" }, { hasUserLabel: true, resourceNames: names })).toBe("profile · Fast");
    expect(summaryFor("llm", { llmProfileId: "lp_unknown" }, { hasUserLabel: true })).toBe("profile · lp_unknown");
    expect(summaryFor("tool_loop", { llmProfileId: "lp", maxToolIterations: 2 }, { resourceNames: names })).toBe(
      "LLM profile · max 2 iterations",
    );
    expect(summaryFor("llm", { provider: "groq", llmProfileId: "" })).toBe("via groq");
  });
});

// Wave 7c (STO-612), moved from Studio's lib/subgraphs.test.ts.
describe("subgraph card text", () => {
  it("titles by child name and summarizes the version", () => {
    const config = { graphId: "answer_1", version: "latest" };
    const names = { "graphs:answer_1": "Answer branch" };
    expect(boundTitleFor("subgraph", config, names)).toBe("Answer branch");
    expect(labelFor("subgraph", config)).toBe("answer_1");
    expect(summaryFor("subgraph", config, { resourceNames: names })).toBe("latest release");
    expect(summaryFor("subgraph", { ...config, version: "rel_9" }, { hasUserLabel: true, resourceNames: names })).toBe("Answer branch · rel_9");
    expect(summaryFor("subgraph", { graphId: "" })).toBe("Pick a graph");
    expect(versionLabel("draft")).toBe("draft");
  });
});
