import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ client: { prompts: {}, tools: {}, agents: {}, mcpServers: {}, llmProfiles: {}, transforms: {} } }));

import { RESOURCE_KINDS, agentKind, llmProfileKind, mcpKind, normalizeParametersJson, parametersJsonIssue, promptKind, toolKind, transformKind } from "./resource-kinds";

// studio-graph-workbench-redesign-plan.md, Wave 4b (STO-605): the configs
// carry each page's former validation, moved verbatim.
describe("resource kinds", () => {
  it("covers every CRUD registry once, with human nouns for dialog copy", () => {
    expect(RESOURCE_KINDS.map((kind) => kind.id)).toEqual(["agents", "prompts", "tools", "mcp", "llmProfiles", "transforms"]);
    expect(mcpKind.noun).toBe("MCP server");
    expect(llmProfileKind.noun).toBe("LLM profile");
  });

  it("keeps only the field a transform's type uses, and requires it", () => {
    expect(transformKind.normalize({ id: "t", name: "T", type: "select", pointer: " " })).toBeNull();
    expect(transformKind.normalize({ id: " t ", name: " T ", type: "select", pointer: " /answer ", template: "{value}" })).toEqual({
      id: "t",
      name: "T",
      description: null,
      type: "select",
      pointer: "/answer",
    });
    expect(transformKind.normalize({ id: "t", name: "T", type: "format_message", template: " Topic: {value} " })?.template).toBe(" Topic: {value} ");
  });

  it("requires each kind's mandatory fields, says what's missing, and trims", () => {
    expect(promptKind.normalize({ id: "p", name: "N", body: " " })).toBeNull();
    expect(promptKind.issues({ id: "p", name: "", body: " " })).toEqual(["Add a name.", "Add a body."]);
    expect(promptKind.normalize({ id: " p ", name: " N ", body: " b " })).toEqual({ id: "p", name: "N", body: "b" });
    expect(promptKind.issues({ id: "has space", name: "N", body: "b" })).toEqual([expect.stringMatching(/^Ids use letters/)]);

    expect(llmProfileKind.normalize({ id: "l", name: "L", model: "" })).toBeNull();
    // Provider is a real chat provider now (C3), not free text.
    expect(llmProfileKind.issues({ id: "l", name: "L", model: "m", model_provider: "opneai" })).toEqual(["Pick a provider."]);
    expect(llmProfileKind.normalize({ id: "l", name: "L", model: " m ", model_provider: "groq" })).toEqual({
      id: "l",
      name: "L",
      model: "m",
      model_provider: "groq",
      description: null,
    });

    expect(mcpKind.normalize({ id: "s", name: "S", url: "" })).toBeNull();
    expect(mcpKind.issues({ id: "s", name: "S", url: "not a url" })).toEqual([expect.stringMatching(/full URL/)]);
    expect(mcpKind.issues({ id: "s", name: "S", url: "ftp://x" })).toEqual([expect.stringMatching(/http/)]);
    expect(mcpKind.normalize({ id: "s", name: "S", url: " https://x/mcp " })).toEqual({ id: "s", name: "S", url: "https://x/mcp", transport: "http", enabled: true });
  });

  it("validates tool parameters as a JSON object and preserves an existing MCP binding on edit", () => {
    expect(parametersJsonIssue('{ "a": 1 }')).toBeNull();
    expect(parametersJsonIssue("  ")).toBeNull();
    expect(parametersJsonIssue("not json")).toMatch(/^Parameters aren't valid JSON/);
    expect(parametersJsonIssue("[1]")).toMatch(/JSON object/);
    expect(normalizeParametersJson('{ "a": 1 }')).toBe('{"a":1}');
    expect(normalizeParametersJson("  ")).toBe("{}");
    expect(toolKind.normalize({ id: "t", description: "d", parameters_json: "{", requires_approval: false })).toBeNull();
    expect(toolKind.issues({ id: "", description: "", parameters_json: "{}" })).toEqual(["Add a tool name.", "Add a description."]);
    expect(toolKind.toForm?.({ id: "t", description: "d", parameters_json: "", requires_approval: false }).parameters_json).toBe("{}");
    const saved = toolKind.normalize({ id: "t", description: "d", parameters_json: "{}", requires_approval: true, mcp_server_id: "mcp_1", mcp_tool_name: "echo" });
    expect(saved).toMatchObject({ mcp_server_id: "mcp_1", mcp_tool_name: "echo", requires_approval: true });
  });

  it("requires an agent's graph and dedupes its allowed tools", () => {
    expect(agentKind.normalize({ id: "a", name: "A", graph_id: " " })).toBeNull();
    expect(agentKind.normalize({ id: "a", name: "A", graph_id: "g1", tool_ids: ["x", "x", "y"], description: " ", llm_profile_id: "" })).toEqual({
      id: "a",
      name: "A",
      description: null,
      graph_id: "g1",
      llm_profile_id: null,
      system_prompt_id: null,
      system_instructions: null,
      tool_ids: ["x", "y"],
    });
  });
});
