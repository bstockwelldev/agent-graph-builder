import type { KnowledgeLineageEntry } from "@bstockwelldev/agent-graph-sdk";
import { describe, expect, it } from "vitest";

import { describeEmbedding, summarizeLineageByDocument } from "./knowledgePanel";

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

describe("describeEmbedding", () => {
  const base = { graphId: "g", documents: [], chunkCount: 0, embeddingProvider: null, embeddingModelId: null };

  it("names the provider a first upload will use", () => {
    expect(
      describeEmbedding({ ...base, activeEmbeddingProvider: "supabase", activeEmbeddingModelId: "gte-small" }),
    ).toEqual({ tone: "ok", text: "Uploads will embed with Supabase Edge Function · gte-small" });
  });

  it("explains that the public demo turns embeddings off", () => {
    expect(
      describeEmbedding({
        ...base,
        activeEmbeddingProvider: null,
        activeEmbeddingModelId: null,
        embeddingUnavailableReason: "public_demo_mode",
      })?.text,
    ).toBe("Embeddings are off on this public demo, so uploads are disabled.");
  });

  it("warns when no provider is configured", () => {
    expect(describeEmbedding({ ...base, activeEmbeddingProvider: null, activeEmbeddingModelId: null })?.tone).toBe(
      "warning",
    );
  });

  it("shows the indexed provider, model and dimensions", () => {
    expect(
      describeEmbedding({
        ...base,
        embeddingProvider: "supabase",
        embeddingModelId: "gte-small",
        embeddingDimensions: 384,
        activeEmbeddingProvider: "supabase",
        activeEmbeddingModelId: "gte-small",
      }),
    ).toEqual({ tone: "ok", text: "Embeddings: Supabase Edge Function · gte-small · 384-dim" });
  });

  it("warns when the indexed provider is no longer configured", () => {
    const status = describeEmbedding({
      ...base,
      embeddingProvider: "openai",
      embeddingModelId: "text-embedding-3-small",
      activeEmbeddingProvider: null,
      activeEmbeddingModelId: null,
    });
    expect(status?.tone).toBe("warning");
    expect(status?.text).toContain("OpenAI · text-embedding-3-small");
  });

  it("falls back to the indexed provider on backends without active fields", () => {
    expect(describeEmbedding({ ...base, embeddingProvider: "openai", embeddingModelId: "m" })?.text).toBe(
      "Embeddings: OpenAI · m",
    );
    expect(describeEmbedding(base)).toBeNull();
  });
});
