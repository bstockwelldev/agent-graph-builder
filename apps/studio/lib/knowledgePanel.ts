import type { KnowledgeLineageEntry, KnowledgeSummary } from "@bstockwelldev/agent-graph-sdk";

// Pure helpers for KnowledgePanel.tsx (kept out of the component so they're
// unit-testable without rendering).

// SDK 1/7: moved to lib/apiErrors.ts (typed AgentGraphApiError, no string
// parsing); re-exported here so existing imports keep working.
export { errorDetail } from "./apiErrors";

export type DocumentUsage = {
  documentId: string;
  documentName: string;
  /** Chunk retrievals recorded — one lineage row per chunk used. */
  retrievals: number;
  /** Distinct runs that used at least one chunk of this document. */
  runs: number;
  /** ISO timestamp of the most recent retrieval. */
  lastUsedAt: string;
};

/** Collapses per-chunk lineage rows into one usage row per document, most recently used first. */
export function summarizeLineageByDocument(entries: KnowledgeLineageEntry[]): DocumentUsage[] {
  const byDocument = new Map<string, DocumentUsage & { runIds: Set<string> }>();
  for (const entry of entries) {
    const existing = byDocument.get(entry.document_id);
    if (existing) {
      existing.retrievals += 1;
      existing.runIds.add(entry.run_id);
      if (entry.created_at > existing.lastUsedAt) existing.lastUsedAt = entry.created_at;
    } else {
      byDocument.set(entry.document_id, {
        documentId: entry.document_id,
        documentName: entry.document_name,
        retrievals: 1,
        runs: 0,
        lastUsedAt: entry.created_at,
        runIds: new Set([entry.run_id]),
      });
    }
  }
  return [...byDocument.values()]
    .map(({ runIds, ...usage }) => ({ ...usage, runs: runIds.size }))
    .sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : a.lastUsedAt > b.lastUsedAt ? -1 : 0));
}

const EMBEDDING_PROVIDER_LABELS: Record<string, string> = {
  supabase: "Supabase Edge Function",
  openai: "OpenAI",
  google: "Google Gemini",
};

export function embeddingProviderLabel(provider: string): string {
  return EMBEDDING_PROVIDER_LABELS[provider] ?? provider;
}

export type EmbeddingStatus = {
  tone: "ok" | "warning";
  /** One line for the panel, e.g. "Supabase Edge Function · gte-small · 384-dim". */
  text: string;
};

/**
 * Which embedding provider/model this graph's knowledge uses, or would use
 * for its first upload. `active*` fields are absent on backends older than
 * them; fall back to the indexed provider alone in that case.
 */
export function describeEmbedding(summary: KnowledgeSummary | null): EmbeddingStatus | null {
  if (!summary) return null;
  const indexed = summary.embeddingProvider && summary.embeddingModelId
    ? `${embeddingProviderLabel(summary.embeddingProvider)} · ${summary.embeddingModelId}`
    : null;
  const dims = summary.embeddingDimensions ? ` · ${summary.embeddingDimensions}-dim` : "";
  const hasActiveField = summary.activeEmbeddingProvider !== undefined;
  const active = summary.activeEmbeddingProvider && summary.activeEmbeddingModelId
    ? `${embeddingProviderLabel(summary.activeEmbeddingProvider)} · ${summary.activeEmbeddingModelId}`
    : null;

  if (indexed) {
    if (hasActiveField && !active && summary.embeddingUnavailableReason === "public_demo_mode") {
      return { tone: "warning", text: `Indexed with ${indexed}${dims}. Retrieval is off on this public demo.` };
    }
    if (hasActiveField && !active) {
      return {
        tone: "warning",
        text: `Indexed with ${indexed}${dims}, which isn't configured now: retrieval is off until it is.`,
      };
    }
    return { tone: "ok", text: `Embeddings: ${indexed}${dims}` };
  }
  if (active) return { tone: "ok", text: `Uploads will embed with ${active}` };
  if (summary.embeddingUnavailableReason === "public_demo_mode") {
    return { tone: "warning", text: "Embeddings are off on this public demo, so uploads are disabled." };
  }
  if (hasActiveField) return { tone: "warning", text: "No embedding provider configured on the server." };
  return null;
}
