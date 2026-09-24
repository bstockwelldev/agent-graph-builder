import { describe, expect, it, vi } from "vitest";

import { createAgentGraphClient } from "./client.js";
import { collectAll, NEXT_CURSOR_HEADER } from "./pagination.js";

// SDK 4/7 (STO-617): namespaces, request objects, cursor pagination, and
// the flat methods as deprecated aliases.

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json", ...headers } });

const graph = (id: string) => ({ id, name: id, entry_node_id: "n", nodes: [], edges: [] });
const run = (id: string) => ({ run_id: id, graph_id: "g", status: "succeeded" });

/** A fake list route over `count` items, honouring ?limit and ?cursor the
 * way backend/app/pagination.py does (cursor = last item's key). */
function pagedServer<T>(count: number, make: (i: number) => T) {
  const items = Array.from({ length: count }, (_, i) => make(i));
  return vi.fn(async (url: string) => {
    const params = new URL(url, "http://x").searchParams;
    const limit = params.get("limit");
    if (!limit) return json(items);
    const start = params.has("cursor") ? Number(params.get("cursor")) + 1 : 0;
    const page = items.slice(start, start + Number(limit));
    const more = start + page.length < items.length;
    return json(page, more ? { [NEXT_CURSOR_HEADER]: String(start + page.length - 1) } : {});
  });
}

const sent = (fetch: ReturnType<typeof vi.fn>, call = 0) => {
  const [url, init] = fetch.mock.calls[call] as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

describe("cursor pagination", () => {
  it("iterates 250 items across pages, with no gaps or repeats", async () => {
    const fetch = pagedServer(250, (i) => graph(`g${String(i).padStart(3, "0")}`));
    const client = createAgentGraphClient({ fetch: fetch as never });
    const all = await collectAll(client.graphs.iterate({ pageSize: 100 }));
    expect(all.map((g) => g.id)).toEqual(Array.from({ length: 250 }, (_, i) => `g${String(i).padStart(3, "0")}`));
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      "/api/graphs?limit=100",
      "/api/graphs?limit=100&cursor=99",
      "/api/graphs?limit=100&cursor=199",
    ]);
  });

  it("listPage returns one page and nextCursor (null on the last); list() stays unpaged", async () => {
    const fetch = pagedServer(120, (i) => run(`r${i}`));
    const client = createAgentGraphClient({ fetch: fetch as never });
    const first = await client.runs.listPage({ graphId: "g 1", limit: 110 });
    expect([first.items.length, first.nextCursor]).toEqual([110, "109"]);
    expect(fetch.mock.calls[0][0]).toBe("/api/graphs/g%201/runs?limit=110");
    const last = await client.runs.listPage({ graphId: "g 1", limit: 110, cursor: first.nextCursor! });
    expect([last.items.length, last.nextCursor]).toEqual([10, null]);

    expect(await client.runs.list()).toHaveLength(120);
    expect(fetch.mock.calls.at(-1)![0]).toBe("/api/runs");
  });

  it("pages resources, versions, releases, exceptions and lineage on their own routes", async () => {
    const fetch = pagedServer(3, (i) => ({ id: `x${i}` }));
    const client = createAgentGraphClient({ fetch: fetch as never });
    await Promise.allSettled([
      client.prompts.listPage({ limit: 2 }),
      client.prompts.versions.listPage("p1", { limit: 2 }),
      client.releases.listPage("g", { limit: 2 }),
      client.policies.exceptions.listPage({ limit: 2 }),
      client.policies.exceptions.listPage({ graphId: "g", limit: 2 }),
      client.knowledge.lineagePage("g", { documentId: "d 1", limit: 2 }),
    ]);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      "/api/prompts?limit=2",
      "/api/prompts/p1/versions?limit=2",
      "/api/graphs/g/releases?limit=2",
      "/api/policy-exceptions?limit=2",
      "/api/graphs/g/policy-exceptions?limit=2",
      "/api/graphs/g/knowledge/lineage?document_id=d+1&limit=2",
    ]);
  });
});

describe("request objects", () => {
  it("map camelCase requests to the API's snake_case bodies", async () => {
    const exception = { id: "e", graph_id: "g", policy_code: "P", created_at: "t", expires_at: "t2" };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(exception))
      .mockResolvedValueOnce(json({ release: {}, created: true }))
      .mockResolvedValueOnce(json({ ...run("r"), status: "queued" }));
    const client = createAgentGraphClient({ fetch });

    await client.policies.exceptions.create("g", { code: "P", expiresAt: "t2", nodeId: "n", reason: "why" });
    expect(sent(fetch, 0)).toEqual({
      url: "/api/graphs/g/policy-exceptions",
      method: "POST",
      body: { policy_code: "P", node_id: "n", reason: "why", expires_at: "t2" },
    });

    await client.releases.publish("g", { notes: "first", author: "me" }).catch(() => undefined);
    expect(sent(fetch, 1).body).toEqual({ release_notes: "first", author: "me" });

    const handle = await client.runs.start({ graphId: "g", input: { q: 1 }, apiKey: "k", nodeOutputs: { a: 1 } });
    expect(handle.run.status).toBe("queued");
    expect(sent(fetch, 2).body).toEqual({ graph_id: "g", input: { q: 1 }, api_key: "k", node_outputs: { a: 1 } });
  });

  it("builds nested routes and queries from the request", async () => {
    const fetch = vi.fn().mockImplementation(async () => json({}));
    const client = createAgentGraphClient({ fetch });
    await Promise.allSettled([
      client.graphs.impact("g", { nodeId: "n/1", draft: graph("g") as never }),
      client.routingLab.compareRelease("g", { releaseId: "latest", dataset: [] }),
      client.analytics.nodeHistory("g", "n", { limit: 5 }),
      client.providers.models("groq", { graphId: "g" }),
      client.policies.effective({ graphId: "g" }),
      client.policies.effective(),
      client.runs.resume("r", { approve: false }),
    ]);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      "/api/graphs/g/nodes/n%2F1/impact",
      "/api/graphs/g/routing-lab/compare-release/latest",
      "/api/graphs/g/nodes/n/history?limit=5",
      "/api/providers/groq/models?graph_id=g",
      "/api/graphs/g/policies/effective",
      "/api/policies/effective",
      "/api/runs/r/resume",
    ]);
    expect(sent(fetch, 6).body).toEqual({ approve: false });
  });
});

describe("deprecated flat aliases", () => {
  it("send exactly what their namespaced method sends", async () => {
    const fetch = vi.fn().mockImplementation(async () => json({}));
    const client = createAgentGraphClient({ fetch });
    const pairs: [() => Promise<unknown>, () => Promise<unknown>][] = [
      [() => client.createPolicyException("g", "P", "t", undefined, "r"), () => client.policies.exceptions.create("g", { code: "P", expiresAt: "t", reason: "r" })],
      [() => client.publishRelease("g", "n"), () => client.releases.publish("g", { notes: "n" })],
      [() => client.extractSubgraph("g", graph("g") as never, { node_ids: ["a"], name: "s" }), () => client.graphs.extractSubgraph("g", { draft: graph("g") as never, nodeIds: ["a"], name: "s" })],
      [() => client.compareRoutingDatasets("g", "h", []), () => client.routingLab.compare("g", { otherGraphId: "h", dataset: [] })],
      [() => client.getKnowledgeLineage("g", "d"), () => client.knowledge.lineage("g", { documentId: "d" })],
      [() => client.getGraphAnalytics("g", 20), () => client.analytics.graph("g", { window: 20 })],
      [() => client.sendChatMessage("s", "hi"), () => client.chatSessions.send("s", { content: "hi" })],
      [() => client.resumeRun("r"), () => client.runs.resume("r")],
    ];
    for (const [alias, namespaced] of pairs) {
      fetch.mockClear();
      await alias().catch(() => undefined);
      await namespaced().catch(() => undefined);
      expect(sent(fetch, 0)).toEqual(sent(fetch, 1));
    }
  });

  it("client.with() scopes the namespaces too", async () => {
    const fetch = vi.fn().mockImplementation(async () => json(graph("g")));
    await createAgentGraphClient({ fetch }).with({ headers: { "X-Trace": "1" } }).graphs.get("g");
    expect(new Headers((fetch.mock.calls[0][1] as RequestInit).headers).get("x-trace")).toBe("1");
  });
});

describe("graphs.summaries", () => {
  it("lists /api/graph-summaries and validates the summary shape", async () => {
    const summary = { id: "g1", name: "G1", updated_at: null, node_count: 2, edge_count: 1, input_variables: ["question"], subgraph_ids: [] };
    const fetch = vi.fn(async () => json([summary]));
    const client = createAgentGraphClient({ fetch: fetch as never });
    expect(await client.graphs.summaries.list()).toEqual([summary]);
    expect(sent(fetch).url).toBe("/api/graph-summaries");
  });
});
