import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KnowledgeLineageEntry, KnowledgeSummary } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { color, fontFamily, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { errorDetail, summarizeLineageByDocument } from "@/lib/knowledgePanel";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { SkeletonBlock } from "./ui/Skeleton";

// Knowledge base panel (docs/planning/features/studio-shell-ux-gap-analysis.md,
// "Knowledge base has zero UI anywhere in apps/studio"). Graph-scoped, like
// ReleasesPanel/RoutingLabPanel: the backend (backend/app/knowledge.py)
// keeps one knowledge base per graph and `compute_llm` augments every llm
// node's prompt from it automatically — there is no per-node opt-in, so
// this is a graph-level door, not a node inspector field.

const RECENT_RETRIEVALS_SHOWN = 15;

function shortId(id: string, length = 10): string {
  return id.length > length ? `${id.slice(0, length)}…` : id;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function KnowledgePanel({
  graphId,
  layout = "rail",
  reducedMotion = false,
}: {
  graphId: string | null;
  layout?: "rail" | "drawer";
  reducedMotion?: boolean;
}) {
  const [summary, setSummary] = useState<KnowledgeSummary | null>(null);
  const [lineage, setLineage] = useState<KnowledgeLineageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lineageError, setLineageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lineage is secondary to the document list: a failure there must not
  // hide documents the user can still act on, so it has its own error slot.
  const loadLineage = useCallback(async (id: string) => {
    try {
      setLineage(await client.knowledge.lineage(id));
      setLineageError(null);
    } catch (err) {
      setLineageError(errorDetail(err));
    }
  }, []);

  useEffect(() => {
    if (!graphId) {
      setSummary(null);
      setLineage([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPendingDeleteId(null);
    void (async () => {
      try {
        const loaded = await client.knowledge.get(graphId);
        if (!cancelled) setSummary(loaded);
      } catch (err) {
        if (!cancelled) setError(errorDetail(err));
      }
      if (!cancelled) {
        await loadLineage(graphId);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [graphId, loadLineage]);

  const handleFileChosen = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!graphId || !file) return;
      setUploading(true);
      setError(null);
      try {
        const result = await client.knowledge.upload(graphId, file);
        setSummary({ graphId, ...result });
      } catch (err) {
        setError(errorDetail(err));
      } finally {
        setUploading(false);
        // Clearing the value lets the user re-pick the same file after fixing it.
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [graphId],
  );

  const handleDelete = useCallback(
    async (documentId: string) => {
      if (!graphId) return;
      setDeletingId(documentId);
      setError(null);
      try {
        const result = await client.knowledge.delete(graphId, documentId);
        setSummary({ graphId, ...result });
        setPendingDeleteId(null);
      } catch (err) {
        setError(errorDetail(err));
      } finally {
        setDeletingId(null);
      }
    },
    [graphId],
  );

  const documents = summary?.documents ?? [];
  const usage = summarizeLineageByDocument(lineage);
  const recent = [...lineage].reverse().slice(0, RECENT_RETRIEVALS_SHOWN);
  const busy = uploading || deletingId !== null;

  return (
    <div style={containerStyle(layout)}>
      <div style={scrollerStyle}>
        <CollapsibleSection sectionId="knowledge-documents" title="Documents" defaultOpen reducedMotion={reducedMotion}>
          <div style={{ ...typeScale.caption, opacity: 0.7, lineHeight: "16px", marginBottom: spacing[2] }}>
            Upload <code style={monoStyle}>.txt</code> or <code style={monoStyle}>.md</code> files (up to 400 KB each).
            Every <code style={monoStyle}>llm</code> node in this graph retrieves from them automatically.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            aria-label="Upload knowledge document"
            style={{ display: "none" }}
            onChange={(e) => void handleFileChosen(e.target.files)}
          />
          <Button
            variant="primary"
            disabled={!graphId || busy}
            onClick={() => fileInputRef.current?.click()}
            style={{ minHeight: shell.touchTarget.min }}
          >
            {uploading ? "Embedding…" : "Upload document"}
          </Button>
          {error && (
            <div role="alert" style={{ ...typeScale.caption, color: color.warning[500], marginTop: spacing[2], lineHeight: "16px" }}>
              {error}
            </div>
          )}
          <div style={{ marginTop: spacing[3] }}>
            {loading ? (
              <SkeletonBlock lines={3} gap={spacing[2]} />
            ) : documents.length === 0 ? (
              <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
                No documents yet. Upload one to give this graph a knowledge base.
              </div>
            ) : (
              <>
                <div style={{ ...typeScale.caption, opacity: 0.7, marginBottom: spacing[2] }}>
                  {documents.length} document{documents.length === 1 ? "" : "s"} · {summary?.chunkCount ?? 0} chunks
                  {summary?.embeddingModelId ? (
                    <>
                      {" · "}
                      <span style={monoStyle}>
                        {summary.embeddingProvider}/{summary.embeddingModelId}
                      </span>
                    </>
                  ) : null}
                </div>
                {documents.map((doc) => (
                  <div key={doc.id} style={rowStyle}>
                    <div style={{ ...typeScale.caption, fontWeight: 600, wordBreak: "break-word" }}>{doc.name}</div>
                    <div style={{ ...typeScale.caption, opacity: 0.7, marginTop: spacing[1] }}>
                      {doc.char_count.toLocaleString()} chars · {formatDate(doc.uploaded_at)}
                    </div>
                    <div style={{ marginTop: spacing[2], display: "flex", gap: spacing[2] }}>
                      {pendingDeleteId === doc.id ? (
                        <>
                          <Button
                            variant="destructive"
                            disabled={busy}
                            onClick={() => void handleDelete(doc.id)}
                            aria-label={`Confirm remove ${doc.name}`}
                          >
                            {deletingId === doc.id ? "Removing…" : "Confirm remove"}
                          </Button>
                          <Button variant="ghost" disabled={busy} onClick={() => setPendingDeleteId(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setPendingDeleteId(doc.id)}
                          aria-label={`Remove ${doc.name}`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection sectionId="knowledge-usage" title="Usage" defaultOpen reducedMotion={reducedMotion}>
          {lineageError ? (
            <div role="alert" style={{ ...typeScale.caption, color: color.warning[500], lineHeight: "16px" }}>
              Couldn&apos;t load usage: {lineageError}
            </div>
          ) : loading ? (
            <SkeletonBlock lines={2} gap={spacing[2]} />
          ) : usage.length === 0 ? (
            <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
              No retrievals recorded yet. Run this graph and the documents its llm nodes draw on show up here.
            </div>
          ) : (
            <>
              {usage.map((row) => (
                <div key={row.documentId} style={rowStyle}>
                  <div style={{ ...typeScale.caption, fontWeight: 600, wordBreak: "break-word" }}>{row.documentName}</div>
                  <div style={{ ...typeScale.caption, opacity: 0.7, marginTop: spacing[1] }}>
                    {row.retrievals} retrieval{row.retrievals === 1 ? "" : "s"} across {row.runs} run
                    {row.runs === 1 ? "" : "s"} · last {formatDate(row.lastUsedAt)}
                  </div>
                </div>
              ))}
              <div style={{ ...typeScale.caption, fontWeight: 600, margin: `${spacing[3]}px 0 ${spacing[1]}px` }}>
                Recent retrievals
              </div>
              {recent.map((item) => (
                <div key={item.id} style={{ ...typeScale.caption, opacity: 0.8, marginTop: spacing[1] }}>
                  <span style={monoStyle}>{shortId(item.run_id)}</span>
                  {" · "}
                  <span style={monoStyle}>{item.node_id}</span>
                  {" ← "}
                  {item.document_name} ({item.score.toFixed(2)})
                </div>
              ))}
            </>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}

const containerStyle = (layout: "rail" | "drawer"): CSSProperties => ({
  width: "100%",
  height: layout === "rail" ? "100%" : "auto",
  minHeight: 0,
  borderLeft: layout === "drawer" ? undefined : `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  display: "flex",
  flexDirection: "column",
  overflow: layout === "rail" ? "hidden" : "visible",
});

const scrollerStyle: CSSProperties = {
  padding: shell.panelPadding,
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
};

const monoStyle: CSSProperties = { fontFamily: fontFamily.mono };

const rowStyle: CSSProperties = {
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  marginBottom: spacing[2],
};
