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
    fetchMock.mockResolvedValueOnce(jsonResponse({ run_id: "run1", status: "succeeded" }));

    const client = createAgentGraphClient({ baseUrl });
    await client.resumeRun("run1", false, "not today");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/runs/run1/resume`);
    expect(JSON.parse(init.body as string)).toEqual({ approve: false, reason: "not today" });
  });
});
