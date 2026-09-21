import type { KnowledgeLineageEntry } from "@bstockwelldev/agent-graph-sdk";
import { describe, expect, it } from "vitest";

import { errorDetail, summarizeLineageByDocument } from "./knowledgePanel";

function entry(overrides: Partial<KnowledgeLineageEntry>): KnowledgeLineageEntry {
  return {
    id: "k1",
    graph_id: "g1",
    document_id: "d1",
    document_name: "notes.md",
    chunk_id: "c1",
    run_id: "r1",
    node_id: "n1",
    score: 0.5,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("errorDetail", () => {
  it("extracts the FastAPI detail from an SDK jsonFetch error", () => {
    const error = new Error('POST /api/graphs/g1/knowledge failed (503): {"detail":"No embedding provider"}');
    expect(errorDetail(error)).toBe("No embedding provider");
  });

  it("falls back to the raw message when the body isn't JSON", () => {
    const error = new Error("POST /api/graphs/g1/knowledge failed (502): Bad Gateway");
    expect(errorDetail(error)).toBe("POST /api/graphs/g1/knowledge failed (502): Bad Gateway");
  });

  it("falls back to the raw message when the JSON has no string detail", () => {
    const error = new Error('POST /x failed (422): {"detail":[{"msg":"bad"}]}');
    expect(errorDetail(error)).toBe('POST /x failed (422): {"detail":[{"msg":"bad"}]}');
  });

  it("stringifies non-Error values", () => {
    expect(errorDetail("boom")).toBe("boom");
  });
});

describe("summarizeLineageByDocument", () => {
  it("returns an empty list for no lineage", () => {
    expect(summarizeLineageByDocument([])).toEqual([]);
  });

  it("counts every chunk retrieval but only distinct runs", () => {
    const usage = summarizeLineageByDocument([
      entry({ id: "a", chunk_id: "c1", run_id: "r1" }),
      entry({ id: "b", chunk_id: "c2", run_id: "r1" }),
      entry({ id: "c", chunk_id: "c1", run_id: "r2" }),
    ]);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ documentId: "d1", retrievals: 3, runs: 2 });
  });

  it("tracks the latest retrieval time regardless of input order", () => {
    const usage = summarizeLineageByDocument([
      entry({ id: "a", created_at: "2026-03-01T00:00:00Z" }),
      entry({ id: "b", created_at: "2026-02-01T00:00:00Z" }),
    ]);
    expect(usage[0]?.lastUsedAt).toBe("2026-03-01T00:00:00Z");
  });

  it("orders documents most recently used first", () => {
    const usage = summarizeLineageByDocument([
      entry({ id: "a", document_id: "old", document_name: "old.md", created_at: "2026-01-01T00:00:00Z" }),
      entry({ id: "b", document_id: "new", document_name: "new.md", created_at: "2026-02-01T00:00:00Z" }),
    ]);
    expect(usage.map((row) => row.documentId)).toEqual(["new", "old"]);
  });
});
