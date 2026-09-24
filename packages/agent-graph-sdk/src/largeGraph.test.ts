import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentGraphClient } from "./client.js";
import { graphHealthSchema, nodeImpactSchema } from "./schemas.js";

// Wave 7a (STO-610): health score and node impact.

describe("large-graph schemas", () => {
  it("parses health and rejects unknown bands", () => {
    const health = { graph_id: "g", score: 82, band: "attention", factors: [{ id: "warnings", label: "Warnings", deduction: 3, max: 15, items: [{ node_id: "a", message: "m" }] }], computed_at: "t" };
    expect(graphHealthSchema.parse(health).score).toBe(82);
    expect(graphHealthSchema.safeParse({ ...health, band: "fine" }).success).toBe(false);
  });

  it("parses impact", () => {
    const impact = nodeImpactSchema.parse({
      node_id: "n",
      downstream: ["a"],
      outputs_reached: [],
      routers_downstream: [],
      upstream_count: 1,
      bindings: [],
      runs: { executions: 0 },
      releases: [{ release_id: "r", created_at: "t", changed_since: true }],
      datasets: [],
    });
    expect(impact.releases[0].changed_since).toBe(true);
  });
});

describe("large-graph client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the draft to health and impact routes", async () => {
    const client = createAgentGraphClient({ baseUrl: "http://x" });
    await client.getGraphHealth("g1", { id: "g1" } as never).catch(() => undefined);
    await client.getNodeImpact("g1", "a b", { id: "g1" } as never).catch(() => undefined);
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1].method, JSON.parse(c[1].body).id])).toEqual([
      ["http://x/api/graphs/g1/health", "POST", "g1"],
      ["http://x/api/graphs/g1/nodes/a%20b/impact", "POST", "g1"],
    ]);
  });
});
