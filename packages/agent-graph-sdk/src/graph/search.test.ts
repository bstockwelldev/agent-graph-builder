import { describe, expect, it } from "vitest";

import { parseQuery, searchNodes } from "./search.js";

const nodes = [
  { id: "input_1", data: { nodeType: "input", label: "input: question", config: { variableName: "question" } } },
  { id: "llm_classify", data: { nodeType: "llm", label: "qwen2.5:3b", config: { model: "qwen2.5:3b" } } },
  { id: "router_1", data: { nodeType: "router", label: "router", config: {} } },
  { id: "llm_answer", data: { nodeType: "llm", label: "qwen2.5:3b", config: { model: "qwen2.5:3b", systemPrompt: "Be helpful" } } },
  { id: "llm", data: { nodeType: "prompt", label: "odd id", config: {} } },
];

describe("graphSearch", () => {
  it("parses type filters", () => {
    expect(parseQuery("type:LLM  qwen ")).toEqual({ type: "llm", text: "qwen" });
  });

  it("ranks exact id, then prefix, then contains/config", () => {
    expect(searchNodes(nodes, "llm")).toEqual(["llm", "llm_classify", "llm_answer"]);
    expect(searchNodes(nodes, "helpful")).toEqual(["llm_answer"]);
    expect(searchNodes(nodes, "question")).toEqual(["input_1"]);
  });

  it("filters by type, alone or with text", () => {
    expect(searchNodes(nodes, "type:llm")).toEqual(["llm_classify", "llm_answer"]);
    expect(searchNodes(nodes, "type:llm answer")).toEqual(["llm_answer"]);
    expect(searchNodes(nodes, "   ")).toEqual([]);
  });
});
