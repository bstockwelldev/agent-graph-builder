import type { KnowledgeLineageEntry } from "@bstockwelldev/agent-graph-sdk";

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
