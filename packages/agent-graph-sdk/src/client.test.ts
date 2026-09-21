import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentGraphClient } from "./client.js";
import type { PromptTemplate } from "./types.js";

// Studio-consolidation Phase 3 (docs/planning/features/studio-consolidation-plan.md):
// the SDK client had exactly zero tests before this file — see the plan's
// Risks table ("the SDK becomes the studio's only server contract but has
// exactly 1 test"). These exercise the resource CRUD helpers and
// deleteGraph against a mocked fetch, without a live backend.

describe("createAgentGraphClient resource CRUD", () => {
  const baseUrl = "http://localhost:8000";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  }

  it("prompts.list fetches GET /api/prompts", async () => {
    const prompts: PromptTemplate[] = [{ id: "p1", name: "Greeting", body: "Hi" }];
    fetchMock.mockResolvedValueOnce(jsonResponse(prompts));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.prompts.list();

    expect(result).toEqual(prompts);
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/api/prompts`, expect.objectContaining({ headers: expect.any(Object) }));
  });

  it("tools.create POSTs the full resource body", async () => {
    const tool = { id: "t1", description: "desc", parameters_json: "{}", requires_approval: false };
    fetchMock.mockResolvedValueOnce(jsonResponse(tool));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.tools.create(tool as never);

    expect(result).toEqual(tool);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(tool);
  });

  it("mcpServers.update PUTs to /api/mcp-servers/{id}", async () => {
    const server = { id: "srv1", name: "Test", url: "https://example.com", transport: "http" as const, enabled: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(server));

    const client = createAgentGraphClient({ baseUrl });
    await client.mcpServers.update(server);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/mcp-servers/srv1`);
    expect(init.method).toBe("PUT");
  });

  it("prompts.versions.publish POSTs to /api/prompts/{id}/versions", async () => {
    const response = {
      version: {
        version_id: "rver_1",
        kind: "prompts",
        resource_id: "p1",
        payload: { id: "p1", name: "Greeting", body: "Hi" },
        fingerprint: "a".repeat(64),
        created_at: "2026-09-20T00:00:00Z",
      },
      created: true,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.prompts.versions.publish("p1");

    expect(result).toEqual(response);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/prompts/p1/versions`);
    expect(init.method).toBe("POST");
  });

  it("tools.versions.list fetches GET /api/tools/{id}/versions", async () => {
    const versions = [{ version_id: "rver_1", fingerprint: "a".repeat(64), created_at: "2026-09-20T00:00:00Z" }];
    fetchMock.mockResolvedValueOnce(jsonResponse(versions));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.tools.versions.list("t1");

    expect(result).toEqual(versions);
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/api/tools/t1/versions`, expect.objectContaining({}));
  });

  it("agents.delete DELETEs /api/agents/{id} and returns the deleted flag", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.agents.delete("agent1");

    expect(result).toEqual({ deleted: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/agents/agent1`);
    expect(init.method).toBe("DELETE");
  });

  it("llmProfiles.get throws a descriptive error on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "not found" }, false, 404));

    const client = createAgentGraphClient({ baseUrl });
    await expect(client.llmProfiles.get("missing")).rejects.toThrow(/failed \(404\)/);
  });

  it("sendChatMessage POSTs the message content to /api/chat-sessions/{id}/messages", async () => {
    const session = {
      id: "chat1",
      title: "Scratchpad",
      provider: "stub",
      model: "stub",
      messages: [
        { role: "user", content: "hi", created_at: "2026-01-01T00:00:00Z" },
        { role: "assistant", content: "[stub answer] hi", created_at: "2026-01-01T00:00:01Z" },
      ],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:01Z",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(session));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.sendChatMessage("chat1", "hi");

    expect(result).toEqual(session);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/chat-sessions/chat1/messages`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ content: "hi" });
  });

  it("chatSessions.create POSTs to /api/chat-sessions", async () => {
    const session = {
      id: "chat2",
      title: "New scratchpad",
      provider: "stub",
      model: "stub",
      messages: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(session));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.chatSessions.create(session);

    expect(result).toEqual(session);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/chat-sessions`);
    expect(init.method).toBe("POST");
  });

  it("deleteGraph DELETEs /api/graphs/{id}", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.deleteGraph("graph1");

    expect(result).toEqual({ deleted: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/graphs/graph1`);
    expect(init.method).toBe("DELETE");
  });

  it("resumeRun POSTs approve/reason to /api/runs/{id}/resume", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ run_id: "run1", graph_id: "graph1", status: "succeeded" }));

    const client = createAgentGraphClient({ baseUrl });
    await client.resumeRun("run1", false, "not today");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/runs/run1/resume`);
    expect(JSON.parse(init.body as string)).toEqual({ approve: false, reason: "not today" });
  });

  it("listAllRuns fetches GET /api/runs", async () => {
    const runs = [{ run_id: "run1", graph_id: "graph1", status: "succeeded" as const }];
    fetchMock.mockResolvedValueOnce(jsonResponse(runs));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.listAllRuns();

    expect(result).toEqual(runs);
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/api/runs`, expect.objectContaining({}));
  });

  it("getAnalytics fetches GET /api/analytics", async () => {
    const payload = {
      totals: {
        invocations: 3,
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        estimated_usd: 0.01,
        avg_duration_ms: 250,
      },
      daily: [{ date: "2026-01-01", invocations: 3, tokens: 150, estimated_usd: 0.01 }],
      by_graph: [
        { graph_id: "g1", name: "Demo", invocations: 3, tokens: 150, estimated_usd: 0.01 },
      ],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(payload));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.getAnalytics();

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/api/analytics`, expect.objectContaining({}));
  });
});

// P0 graph foundation, Slice C (docs/planning/features/p0-graph-foundation-design-plan.md).
describe("createAgentGraphClient releases", () => {
  const baseUrl = "http://localhost:8000";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  }

  const graph = {
    id: "g1",
    name: "Demo",
    entry_node_id: "n1",
    nodes: [{ id: "n1", type: "input", position: { x: 0, y: 0 }, config: {} }],
    edges: [],
  };

  const release = {
    id: "rel_1",
    graph_id: "g1",
    graph,
    document_fingerprint: "a".repeat(64),
    semantic_fingerprint: "b".repeat(64),
    resource_snapshots: {},
    release_notes: null,
    author: null,
    created_at: "2026-01-01T00:00:00Z",
    diagnostics: [],
  };

  it("publishRelease POSTs release_notes/author to /api/graphs/{id}/releases", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ release, created: true }));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.publishRelease("g1", "first release", "me");

    expect(result).toEqual({ release, created: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/graphs/g1/releases`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ release_notes: "first release", author: "me" });
  });

  it("listReleases fetches GET /api/graphs/{id}/releases", async () => {
    const index = [
      {
        release_id: "rel_1",
        semantic_fingerprint: "b".repeat(64),
        document_fingerprint: "a".repeat(64),
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse(index));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.listReleases("g1");

    expect(result).toEqual(index);
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/api/graphs/g1/releases`, expect.objectContaining({}));
  });

  it("getRelease fetches GET /api/graphs/{id}/releases/{release_id}", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(release));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.getRelease("g1", "rel_1");

    expect(result).toEqual(release);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/graphs/g1/releases/rel_1`,
      expect.objectContaining({}),
    );
  });

  it("compileRelease POSTs to the release_id-only /api/graph-releases/{id}/compile route", async () => {
    const compileResult = { graph_id: "g1", compiled_workflow_id: "cwf_1", diagnostics: [], ok: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(compileResult));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.compileRelease("rel_1");

    expect(result).toEqual(compileResult);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/graph-releases/rel_1/compile`);
    expect(init.method).toBe("POST");
  });

  it("startReleaseRun POSTs input/provider/model/api_key with no graph_id field", async () => {
    const run = { run_id: "run1", graph_id: "g1", status: "succeeded" as const, result: null };
    fetchMock.mockResolvedValueOnce(jsonResponse(run));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.startReleaseRun("rel_1", { question: "hi" }, "stub", "m1", "key1");

    expect(result).toEqual(run);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/graph-releases/rel_1/runs`);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ input: { question: "hi" }, provider: "stub", model: "m1", api_key: "key1" });
    expect(body.graph_id).toBeUndefined();
  });

  it("getRuntimeTargetCapabilities fetches GET /api/runtime-targets/{id}/capabilities", async () => {
    const matrix = {
      target_id: "langgraph",
      capabilities: [{ feature: "current_12_executors", supported: true, notes: null }],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(matrix));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.getRuntimeTargetCapabilities("langgraph");

    expect(result).toEqual(matrix);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/runtime-targets/langgraph/capabilities`,
      expect.objectContaining({}),
    );
  });

  it("getRunGraphSnapshot fetches GET /api/runs/{id}/snapshot", async () => {
    const snapshot = {
      run_id: "run_1",
      graph_id: "g1",
      source: "draft_snapshot" as const,
      graph_fingerprint: "a".repeat(64),
      release_id: null,
      graph,
      resource_snapshots: {},
      created_at: "2026-01-01T00:00:00Z",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(snapshot));

    const client = createAgentGraphClient({ baseUrl });
    const result = await client.getRunGraphSnapshot("run_1");

    expect(result).toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/runs/run_1/snapshot`,
      expect.objectContaining({}),
    );
  });
});

// Studio-consolidation Phase 4f: jsonFetch now parses every response through
// a Zod schema instead of an unchecked `response.json() as T` cast. These
// cases exercise that rejection path for the highest-traffic response types.
describe("createAgentGraphClient response validation", () => {
  const baseUrl = "http://localhost:8000";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  }

  it("getGraph rejects a GraphDefinition response missing required fields", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "g1", name: "Untitled" }));

    const client = createAgentGraphClient({ baseUrl });
    await expect(client.getGraph("g1")).rejects.toThrow(/unexpected shape/);
  });

  it("getRun rejects a RunSummary response with the wrong status enum", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ run_id: "run1", graph_id: "graph1", status: "not_a_real_status" }),
    );

    const client = createAgentGraphClient({ baseUrl });
    await expect(client.getRun("run1")).rejects.toThrow(/unexpected shape/);
  });

  it("compileGraph rejects a CompileResult response whose diagnostics aren't an array", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ graph_id: "g1", compiled_workflow_id: null, diagnostics: "none", ok: true }),
    );

    const client = createAgentGraphClient({ baseUrl });
    await expect(client.compileGraph("g1")).rejects.toThrow(/unexpected shape/);
  });

  it("getAnalytics rejects a response missing the totals object", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ daily: [], by_graph: [] }));

    const client = createAgentGraphClient({ baseUrl });
    await expect(client.getAnalytics()).rejects.toThrow(/unexpected shape/);
  });

  it("prompts.get rejects a PromptTemplate response missing body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "p1", name: "Greeting" }));

    const client = createAgentGraphClient({ baseUrl });
    await expect(client.prompts.get("p1")).rejects.toThrow(/unexpected shape/);
  });

  it("llmProfiles.list rejects a response that isn't an array", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "lp1", name: "Default", model: "gpt-4o" }));

    const client = createAgentGraphClient({ baseUrl });
    await expect(client.llmProfiles.list()).rejects.toThrow(/unexpected shape/);
  });

  it("sendChatMessage rejects a ChatSession response with a non-array messages field", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "chat1",
        title: "Scratchpad",
        provider: "stub",
        model: "stub",
        messages: "not-an-array",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }),
    );

    const client = createAgentGraphClient({ baseUrl });
    await expect(client.sendChatMessage("chat1", "hi")).rejects.toThrow(/unexpected shape/);
  });
});

// Knowledge base client (backend/app/knowledge.py) — get/upload/delete had
// no client methods before the Studio knowledge panel.
describe("createAgentGraphClient knowledge base", () => {
  const baseUrl = "http://localhost:8000";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  }

  const doc = {
    id: "d1",
    name: "notes.md",
    mime_type: "text/markdown",
    uploaded_at: "2026-01-01T00:00:00Z",
    char_count: 120,
  };
  const summary = { documents: [doc], chunkCount: 2, embeddingProvider: "openai", embeddingModelId: "m" };

  it("getKnowledge fetches GET /api/graphs/{id}/knowledge", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ graphId: "g1", ...summary }));

    const result = await createAgentGraphClient({ baseUrl }).getKnowledge("g1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/api/graphs/g1/knowledge`);
    expect(result.documents).toHaveLength(1);
  });

  it("getKnowledge accepts the empty-state shape (null embedding fields)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ graphId: "g1", documents: [], chunkCount: 0, embeddingProvider: null, embeddingModelId: null }),
    );

    const result = await createAgentGraphClient({ baseUrl }).getKnowledge("g1");

    expect(result.embeddingProvider).toBeNull();
  });

  it("uploadKnowledgeDocument POSTs multipart form data without a JSON content type", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, documentId: "d1", addedChunkCount: 2, ...summary }));
    const file = new File(["hello"], "notes.md", { type: "text/markdown" });

    const result = await createAgentGraphClient({ baseUrl }).uploadKnowledgeDocument("g1", file);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseUrl}/api/graphs/g1/knowledge`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init.headers).toEqual({});
    expect(result.addedChunkCount).toBe(2);
  });

  it("deleteKnowledgeDocument sends DELETE and validates the summary response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, documents: [], chunkCount: 0, embeddingProvider: null, embeddingModelId: null }),
    );

    const result = await createAgentGraphClient({ baseUrl }).deleteKnowledgeDocument("g1", "d1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseUrl}/api/graphs/g1/knowledge/d1`);
    expect(init.method).toBe("DELETE");
    expect(result.documents).toEqual([]);
  });

  it("getKnowledge rejects a response missing the documents array", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ graphId: "g1", chunkCount: 0 }));

    await expect(createAgentGraphClient({ baseUrl }).getKnowledge("g1")).rejects.toThrow(/unexpected shape/);
  });
});

// Saved Routing Lab datasets (backend/app/resource_models.py FixtureDataset)
// and capture-from-runs (backend/app/datasets.py).
describe("createAgentGraphClient datasets", () => {
  const baseUrl = "http://localhost:8000";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, ok = true, status = 200) {
    return {
      ok,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    };
  }

  const dataset = {
    id: "ds1",
    name: "Captured",
    description: null,
    graph_id: "g1",
    fixtures: [{ input: { question: "q" }, node_outputs: { n1: "x" } }],
    source: "runs",
    source_run_ids: ["r1"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("datasets.list fetches GET /api/datasets", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([dataset]));

    const result = await createAgentGraphClient({ baseUrl }).datasets.list();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/api/datasets`);
    expect(result[0]?.fixtures).toHaveLength(1);
  });

  it("datasets.create POSTs the dataset", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(dataset));

    await createAgentGraphClient({ baseUrl }).datasets.create({ ...dataset, source: "manual" } as never);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseUrl}/api/datasets`);
    expect(init.method).toBe("POST");
  });

  it("createDatasetFromRuns maps camelCase options to the snake_case request", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(dataset));

    const result = await createAgentGraphClient({ baseUrl }).createDatasetFromRuns({
      name: "Captured",
      runIds: ["r1", "r2"],
      includeNodeOutputs: false,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${baseUrl}/api/datasets/from-runs`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Captured",
      run_ids: ["r1", "r2"],
      include_node_outputs: false,
    });
    expect(result.source).toBe("runs");
  });

  it("createDatasetFromRuns freezes node outputs by default", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(dataset));

    await createAgentGraphClient({ baseUrl }).createDatasetFromRuns({ name: "X", runIds: ["r1"] });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).include_node_outputs).toBe(true);
  });

  it("datasets.get rejects a dataset with an unknown source", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...dataset, source: "imported" }));

    await expect(createAgentGraphClient({ baseUrl }).datasets.get("ds1")).rejects.toThrow(/unexpected shape/);
  });
});
