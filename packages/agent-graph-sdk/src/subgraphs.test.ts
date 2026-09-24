import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentGraphClient } from "./client.js";
import { graphUsedBySchema, nodeTypeSchema, runSummarySchema, subgraphExtractResponseSchema } from "./schemas.js";

// Wave 7c (STO-612): graph-as-node subgraphs.

const graph = (id: string) => ({ id, name: id, entry_node_id: "in", nodes: [{ id: "in", type: "input", position: { x: 0, y: 0 }, config: {} }], edges: [] });

describe("subgraph schemas", () => {
  it("accepts the subgraph node type, parent run ids, extract and used-by payloads", () => {
    expect(nodeTypeSchema.parse("subgraph")).toBe("subgraph");
    const run = runSummarySchema.parse({ run_id: "r2", graph_id: "child", status: "succeeded", result: "x", parent_run_id: "r1", parent_node_id: "sub" });
    expect([run.parent_run_id, run.parent_node_id]).toEqual(["r1", "sub"]);
    expect(subgraphExtractResponseSchema.parse({ child_graph: graph("c"), proposed_parent: graph("p") }).child_graph.id).toBe("c");
    expect(graphUsedBySchema.parse([{ graph_id: "p", name: "Parent", node_ids: ["sub"] }])).toHaveLength(1);
    expect(graphUsedBySchema.safeParse([{ graph_id: "p" }]).success).toBe(false);
  });
});

describe("subgraph client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "[]", json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the draft + selection to extract, and GETs used-by", async () => {
    const client = createAgentGraphClient({ baseUrl: "http://x" });
    await client.extractSubgraph("g1", { id: "g1" } as never, { node_ids: ["a", "b"], name: "Branch" }).catch(() => undefined);
    await client.getGraphUsedBy("g1");
    const [extractCall, usedByCall] = fetchMock.mock.calls;
    expect(extractCall[0]).toBe("http://x/api/graphs/g1/extract-subgraph");
    expect(JSON.parse(extractCall[1].body)).toEqual({ draft: { id: "g1" }, node_ids: ["a", "b"], name: "Branch" });
    expect(usedByCall[0]).toBe("http://x/api/graphs/g1/used-by");
  });
});
