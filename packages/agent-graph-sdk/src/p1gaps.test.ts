import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentGraphClient } from "./client.js";
import { counterfactualResultSchema, releaseDiffSchema } from "./schemas.js";

// STO-609: draft diff, routing lab vs release, counterfactual replay.

const run = { run_id: "run_2", graph_id: "g1", status: "succeeded", input: {}, started_at: "t" };

describe("P1 gap schemas", () => {
  it("accepts a draft diff with no to_release_id", () => {
    const diff = releaseDiffSchema.parse({
      from_release_id: "rel_1",
      to_release_id: null,
      to_label: "Draft",
      from_semantic_fingerprint: "a",
      to_semantic_fingerprint: "b",
      identical: false,
      node_changes: [],
      edge_changes: [],
      resource_changes: [],
    });
    expect(diff.to_label).toBe("Draft");
  });

  it("parses a counterfactual result and rejects unknown node modes", () => {
    const base = { run, traces: [], original_run_id: "run_1", counterfactual: true, original_traces: [], changed_nodes: ["a"] };
    expect(counterfactualResultSchema.parse({ ...base, node_modes: { a: "forced" } }).node_modes.a).toBe("forced");
    expect(counterfactualResultSchema.safeParse({ ...base, node_modes: { a: "guessed" } }).success).toBe(false);
  });
});

describe("P1 gap client", () => {
  const baseUrl = "http://localhost:8000";
  let fetchMock: ReturnType<typeof vi.fn>;
  const json = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("replayRun sends a counterfactual body only when given", async () => {
    const result = { run, traces: [], original_run_id: "run_1", counterfactual: false, original_traces: [], changed_nodes: [], node_modes: {} };
    fetchMock.mockResolvedValue(json(result));
    const client = createAgentGraphClient({ baseUrl });
    await client.replayRun("run_1");
    await client.replayRun("run_1", { forced_routes: { router_1: "prompt_answer" } });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ forced_routes: { router_1: "prompt_answer" } });
  });

  it("routes draft diff and routing-vs-release", async () => {
    fetchMock.mockResolvedValue(json({}));
    const client = createAgentGraphClient({ baseUrl });
    await client.compareDraftToRelease("rel_1", { id: "g1" } as never).catch(() => undefined);
    await client.compareRoutingToRelease("g1", "latest", []).catch(() => undefined);
    expect(fetchMock.mock.calls.map((call) => [call[0], call[1].method])).toEqual([
      [`${baseUrl}/api/graph-releases/rel_1/compare-draft`, "POST"],
      [`${baseUrl}/api/graphs/g1/routing-lab/compare-release/latest`, "POST"],
    ]);
  });
});
