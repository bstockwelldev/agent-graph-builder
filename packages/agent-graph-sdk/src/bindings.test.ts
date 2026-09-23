import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NODE_BINDING_FIELDS, nodeBindings } from "./bindings";

describe("node bindings (Wave 4a)", () => {
  it("matches the cross-language contract shared with backend/app/bindings.py", () => {
    const contract = JSON.parse(readFileSync(new URL("../contract/node-bindings.json", import.meta.url), "utf8"));
    expect(NODE_BINDING_FIELDS).toEqual(contract);
  });

  it("lists a node's registry references, skipping empty fields and code tools", () => {
    expect(nodeBindings("llm", { llmProfileId: "lp", systemPromptId: "", model: "x" })).toEqual([
      { field: "llmProfileId", kind: "llm_profiles", resourceId: "lp" },
    ]);
    expect(nodeBindings("tool", { toolName: "lookup_topic" })).toEqual([]);
    expect(nodeBindings("tool", { toolName: "t_1" })).toEqual([{ field: "toolName", kind: "tools", resourceId: "t_1" }]);
    expect(nodeBindings("output", {})).toEqual([]);
  });
});
