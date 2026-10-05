import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ client: { prompts: {}, tools: {}, agents: {}, mcpServers: {}, llmProfiles: {}, transforms: {}, datasets: {}, evals: { suites: {} } } }));

import {
  RESOURCE_KINDS,
  agentKind,
  datasetKind,
  evalSuiteKind,
  llmProfileKind,
  mcpKind,
  normalizeParametersJson,
  parametersJsonIssue,
  promptKind,
  toolKind,
  transformKind,
} from "./resource-kinds";

// studio-graph-workbench-redesign-plan.md, Wave 4b (STO-605): the configs
// carry each page's former validation, moved verbatim.
describe("resource kinds", () => {
  it("covers every CRUD registry once, with human nouns for dialog copy", () => {
    expect(RESOURCE_KINDS.map((kind) => kind.id)).toEqual(["agents", "prompts", "tools", "mcp", "llmProfiles", "transforms", "datasets", "evalSuites"]);
    expect(mcpKind.noun).toBe("MCP server");
    expect(llmProfileKind.noun).toBe("LLM profile");
  });

  it("requires an eval suite's graph, dataset, a scorer and a pass mark", () => {
    const form = { id: "e", name: " Quality ", graph_id: "g", dataset_id: "d", scorers: [{ kind: "contains" as const, weight: 1, args: {} }], threshold_text: "80" };
    expect(evalSuiteKind.issues({ ...form, dataset_id: "", scorers: [], threshold_text: "200" })).toEqual([
      "Pick a dataset.",
      "Pick at least one scorer.",
      "Set a pass mark from 0 to 100.",
    ]);
    expect(evalSuiteKind.normalize(form)).toMatchObject({ id: "e", name: "Quality", graph_id: "g", dataset_id: "d", pass_threshold: 0.8 });
    expect(evalSuiteKind.toForm!({ ...form, pass_threshold: 0.5 } as never)).toMatchObject({ threshold_text: "50" });
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

  it("edits a dataset's fixtures as JSON, keeping its provenance and creation time", () => {
    const stored = {
      id: "ds_1",
      name: "Captured",
      description: null,
      graph_id: "g1",
      fixtures: [{ input: { q: "a" }, node_outputs: { n: 1 } }],
      source: "runs" as const,
      source_run_ids: ["r1"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const form = datasetKind.toForm!(stored);
    expect(JSON.parse(form.fixtures_text!)).toEqual(stored.fixtures);

    expect(datasetKind.issues({ ...form, fixtures_text: "{}" })).toEqual(["Fix the fixtures JSON."]);
    expect(datasetKind.normalize({ ...form, fixtures_text: "{}" })).toBeNull();

    const saved = datasetKind.normalize({ ...form, name: " Renamed ", fixtures_text: '[{"input": {"q": "b"}}]', graph_id: null })!;
    expect(saved).toMatchObject({
      id: "ds_1",
      name: "Renamed",
      graph_id: null,
      fixtures: [{ input: { q: "b" }, node_outputs: {} }],
      source: "runs",
      source_run_ids: ["r1"],
      created_at: stored.created_at,
    });
    expect(saved).not.toHaveProperty("fixtures_text");
    expect(saved.updated_at > stored.updated_at).toBe(true);
    // No graph node binds a dataset and it has no publish history.
    expect(datasetKind.client.usages).toBeUndefined();
    expect(datasetKind.client.versions).toBeUndefined();
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

  it("keeps tools off built-in names and requires a whole MCP binding", () => {
    expect(toolKind.issues({ id: "calculator", description: "d" })).toEqual(["calculator is a built-in tool; pick another name."]);
    expect(toolKind.issues({ id: "t", description: "d", _source: "mcp" })).toEqual(["Pick an MCP server."]);
    expect(toolKind.issues({ id: "t", description: "d", _source: "mcp", mcp_server_id: "srv" })).toEqual(["Pick the server's tool."]);
    // Switching back to Mock drops the binding, and the form-only key never saves.
    expect(toolKind.normalize({ id: "t", description: "d", _source: "mock", mcp_server_id: "srv", mcp_tool_name: "x" })).toEqual({
      id: "t",
      description: "d",
      parameters_json: "{}",
      requires_approval: false,
      mcp_server_id: null,
      mcp_tool_name: null,
    });
    expect(mcpKind.issues({ id: "s", name: "S", url: "https://x", _headers: [{ name: "X-Key", value: "", stored: false }] })).toEqual([
      "Add a value for header X-Key.",
    ]);
    expect(mcpKind.normalize({ id: "s", name: "S", url: "https://x", _headers: [], _headersEdited: true })).toEqual({
      id: "s",
      name: "S",
      url: "https://x",
      transport: "http",
      enabled: true,
    });
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
