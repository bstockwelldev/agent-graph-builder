import type { KnowledgeLineageEntry } from "@bstockwelldev/agent-graph-sdk";

// Pure helpers for KnowledgePanel.tsx (kept out of the component so they're
// unit-testable without rendering).

/**
 * The SDK's `jsonFetch` throws `"POST /path failed (503): {\"detail\":\"...\"}"`
 * on a non-2xx response; the backend's own message (e.g. "no embedding
 * provider configured") is the `detail` inside that JSON body and is what
 * the user actually needs to read. Falls back to the raw message when the
 * body isn't the FastAPI `{detail: string}` shape.
 */
export function errorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const bodyStart = message.indexOf("): ");
  if (bodyStart === -1) return message;
  try {
    const body: unknown = JSON.parse(message.slice(bodyStart + 3));
    if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // not JSON — fall through to the raw message
  }
  return message;
}

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
