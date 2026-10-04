import { describe, expect, it } from "vitest";
import type { LineageGraph } from "@bstockwelldev/agent-graph-sdk";
import { describeLineageNode, knowledgeHitsOf, layoutLineageGraph } from "./lineageGraph";

const graph: LineageGraph = {
  nodes: [
    { id: "node:r1:llm", kind: "node", label: "llm", meta: { runId: "r1", nodeId: "llm" } },
    { id: "run:r1", kind: "run", label: "r1", meta: { runId: "r1", releaseId: "rel_1" } },
    { id: "chunk:c1", kind: "chunk", label: "the sky", meta: { preview: "the sky is blue", removed: false } },
    { id: "doc:d1", kind: "document", label: "facts.md", meta: { versions: [2] } },
  ],
  edges: [
    { source: "doc:d1", target: "chunk:c1", kind: "contains" },
    { source: "chunk:c1", target: "run:r1", kind: "retrieved", score: 0.82 },
    { source: "run:r1", target: "node:r1:llm", kind: "used_in" },
    { source: "run:r1", target: "node:missing", kind: "used_in" },
  ],
  truncated: false,
};

describe("lineage graph layout", () => {
  it("lays documents, chunks, runs and nodes out top to bottom", () => {
    const layout = layoutLineageGraph(graph);
    const y = (id: string) => layout.nodes.find((node) => node.id === id)!.y;
    expect(y("doc:d1")).toBeLessThan(y("chunk:c1"));
    expect(y("chunk:c1")).toBeLessThan(y("run:r1"));
    expect(y("run:r1")).toBeLessThan(y("node:r1:llm"));
    // Edges to unknown nodes are dropped; the rest carry points and scores.
    expect(layout.edges).toHaveLength(3);
    expect(layout.edges.find((edge) => edge.kind === "retrieved")?.score).toBe(0.82);
    expect(layout.edges.every((edge) => edge.points.length >= 2)).toBe(true);
    expect(layout.width).toBeGreaterThan(0);
  });

  it("describes each kind of box", () => {
    expect(graph.nodes.map(describeLineageNode)).toEqual([
      "Node llm in run r1",
      "Run r1 from release rel_1",
      "Chunk: the sky is blue",
      "Document facts.md (version 2)",
    ]);
  });
});

describe("knowledgeHitsOf", () => {
  it("reads the hits an llm trace recorded and skips malformed ones", () => {
    expect(knowledgeHitsOf(null)).toEqual([]);
    expect(knowledgeHitsOf({ systemPrompt: "x" })).toEqual([]);
    expect(
      knowledgeHitsOf({
        knowledgeHits: [
          { documentId: "d1", documentName: "facts.md", documentVersion: 2, chunkId: "c1", rank: 1, score: 0.9, preview: "sky" },
          { documentName: "broken" },
        ],
      }),
    ).toEqual([{ documentId: "d1", documentName: "facts.md", documentVersion: 2, chunkId: "c1", rank: 1, score: 0.9, preview: "sky" }]);
  });
});
