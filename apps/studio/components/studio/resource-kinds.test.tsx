import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ client: { prompts: {}, tools: {}, agents: {}, mcpServers: {}, llmProfiles: {} } }));

import { RESOURCE_KINDS, agentKind, llmProfileKind, mcpKind, normalizeParametersJson, promptKind, toolKind } from "./resource-kinds";

// studio-graph-workbench-redesign-plan.md, Wave 4b (STO-605): the configs
// carry each page's former validation, moved verbatim.
describe("resource kinds", () => {
  it("covers every CRUD registry once, with human nouns for dialog copy", () => {
    expect(RESOURCE_KINDS.map((kind) => kind.id)).toEqual(["agents", "prompts", "tools", "mcp", "llmProfiles"]);
    expect(mcpKind.noun).toBe("MCP server");
    expect(llmProfileKind.noun).toBe("LLM profile");
  });

  it("requires each kind's mandatory fields and trims", () => {
    expect(promptKind.normalize({ id: "p", name: "N", body: " " })).toBeNull();
    expect(promptKind.normalize({ id: " p ", name: " N ", body: " b " })).toEqual({ id: "p", name: "N", body: "b" });
    expect(llmProfileKind.normalize({ id: "l", name: "L", model: "" })).toBeNull();
    expect(llmProfileKind.normalize({ id: "l", name: "L", model: "m", model_provider: " " })).toEqual({
      id: "l",
      name: "L",
      model: "m",
      model_provider: null,
      description: null,
    });
    expect(mcpKind.normalize({ id: "s", name: "S", url: "" })).toBeNull();
    expect(mcpKind.normalize({ id: "s", name: "S", url: "u" })).toEqual({ id: "s", name: "S", url: "u", transport: "http", enabled: true });
  });

  it("keeps tool parameter JSON lenient and preserves an existing MCP binding on edit", () => {
    expect(normalizeParametersJson('{ "a": 1 }')).toBe('{"a":1}');
    expect(normalizeParametersJson("not json")).toBe("not json");
    expect(normalizeParametersJson("  ")).toBe("{}");
    expect(toolKind.toForm?.({ id: "t", description: "d", parameters_json: "", requires_approval: false }).parameters_json).toBe("{}");
    const saved = toolKind.normalize({ id: "t", description: "d", parameters_json: "{}", requires_approval: true, mcp_server_id: "mcp_1", mcp_tool_name: "echo" });
    expect(saved).toMatchObject({ mcp_server_id: "mcp_1", mcp_tool_name: "echo", requires_approval: true });
  });

  it("round-trips agents' optional elements through the one-per-line field", () => {
    expect(
      agentKind.normalize({ id: "a", name: "A", optional_elements: ["x ", "", " y"], description: " " }),
    ).toEqual({ id: "a", name: "A", description: null, default_flow_id: null, system_instructions: null, optional_elements: ["x", "y"] });
  });
});
