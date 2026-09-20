import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import type { Diagnostic, GraphRelease, ReleaseIndexEntry } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { hasBlockingErrors } from "@/lib/diagnostics";
import { accentSurface, color, fontFamily, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { SkeletonBlock } from "./ui/Skeleton";
import { TextArea, TextInput } from "./ui/fields";

// P0 graph foundation, Slices C+D Studio UI
// (docs/planning/features/p0-graph-foundation-design-plan.md): publishing
// and release history for the current graph. Mirrors RunPanel.tsx's
// docked-rail layout/style conventions so it feels like the same panel
// family, not a bolted-on second design.

function shortId(id: string, length = 14): string {
  return id.length > length ? `${id.slice(0, length)}…` : id;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ReleasesPanel({
  graphId,
  diagnostics,
  dirty,
  layout = "rail",
  reducedMotion = false,
}: {
  graphId: string;
  diagnostics: Diagnostic[];
  /** A release always publishes the saved draft (`storage.get_graph`), not
   * unsaved canvas edits — publishing is disabled while dirty rather than
   * silently publishing something other than what's on screen. */
  dirty: boolean;
  layout?: "rail" | "drawer";
  reducedMotion?: boolean;
}) {
  const [releaseNotes, setReleaseNotes] = useState("");
  const [author, setAuthor] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ release: GraphRelease; created: boolean } | null>(null);

  const [releases, setReleases] = useState<ReleaseIndexEntry[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releasesError, setReleasesError] = useState<string | null>(null);

  const [expandedReleaseId, setExpandedReleaseId] = useState<string | null>(null);
  const [expandedRelease, setExpandedRelease] = useState<GraphRelease | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  const blocked = hasBlockingErrors(diagnostics);

  const refreshReleases = useCallback(async () => {
    setReleasesLoading(true);
    setReleasesError(null);
    try {
      const loaded = await client.listReleases(graphId);
      setReleases([...loaded].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      setReleasesError(err instanceof Error ? err.message : String(err));
    } finally {
      setReleasesLoading(false);
    }
  }, [graphId]);

  useEffect(() => {
    void refreshReleases();
  }, [refreshReleases]);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await client.publishRelease(
        graphId,
        releaseNotes.trim() || undefined,
        author.trim() || undefined,
      );
      setLastResult(result);
      if (result.created) setReleaseNotes("");
      await refreshReleases();
    } catch (err) {
      // client.ts's jsonFetch throws a plain Error whose message embeds the
      // 422 body's JSON (message + diagnostics) as raw text — good enough
      // to show verbatim here without a bespoke structured-error path for
      // one endpoint.
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }, [author, graphId, refreshReleases, releaseNotes]);

  const handleToggleRelease = useCallback(
    async (releaseId: string) => {
      if (expandedReleaseId === releaseId) {
        setExpandedReleaseId(null);
        setExpandedRelease(null);
        return;
      }
      setExpandedReleaseId(releaseId);
      setExpandedRelease(null);
      setExpandedLoading(true);
      try {
        const release = await client.getRelease(graphId, releaseId);
        setExpandedRelease(release);
      } catch {
        setExpandedRelease(null);
      } finally {
        setExpandedLoading(false);
      }
    },
    [expandedReleaseId, graphId],
  );

  return (
    <div style={containerStyle(layout)}>
      <div style={scrollerStyle}>
        <CollapsibleSection sectionId="releases-publish" title="Publish" reducedMotion={reducedMotion}>
          {dirty && (
            <div style={warningTextStyle}>
              You have unsaved changes. Save the graph first — a release always publishes the saved draft, never
              unsaved canvas edits.
            </div>
          )}
          {!dirty && blocked && (
            <div style={errorTextStyle}>Resolve blocking validation errors before publishing.</div>
          )}
          <div style={labelStyle}>Release notes (optional)</div>
          <TextArea
            rows={3}
            style={{ minHeight: 64, resize: "vertical" }}
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder="What changed in this release?"
            disabled={publishing}
          />
          <div style={{ ...labelStyle, marginTop: spacing[2] }}>Author (optional)</div>
          <TextInput
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name"
            disabled={publishing}
          />
          <div style={{ marginTop: spacing[2] }}>
            <Button variant="primary" onClick={() => void handlePublish()} disabled={dirty || blocked || publishing}>
              {publishing ? "Publishing…" : "Publish release"}
            </Button>
          </div>
          {publishError && <div style={{ ...errorTextStyle, marginTop: spacing[2] }}>{publishError}</div>}
          {lastResult && (
            <div style={resultTextStyle}>
              {lastResult.created ? "Published " : "Already up to date — "}
              <span style={monoStyle}>{shortId(lastResult.release.id)}</span>
              {" · fingerprint "}
              <span style={monoStyle}>{lastResult.release.semantic_fingerprint.slice(0, 10)}</span>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection sectionId="releases-history" title="Published releases" reducedMotion={reducedMotion}>
          {releasesLoading ? (
            <SkeletonBlock lines={2} gap={spacing[2]} />
          ) : releasesError ? (
            <div style={errorTextStyle}>{releasesError}</div>
          ) : releases.length === 0 ? (
            <div role="status" style={emptyTextStyle}>
              No releases yet. Publish one above to create an immutable, fingerprinted snapshot.
            </div>
          ) : (
            releases.map((entry) => (
              <div key={entry.release_id} style={{ marginBottom: spacing[2] }}>
                <button
                  type="button"
                  onClick={() => void handleToggleRelease(entry.release_id)}
                  aria-expanded={expandedReleaseId === entry.release_id}
                  style={releaseButtonStyle}
                >
                  <div style={rowStyle}>
                    <span style={{ ...monoStyle, fontWeight: 600 }}>{shortId(entry.release_id)}</span>
                    <span style={{ opacity: 0.6 }}>{formatTimestamp(entry.created_at)}</span>
                  </div>
                  <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[1], ...monoStyle }}>
                    {entry.semantic_fingerprint.slice(0, 16)}
                  </div>
                </button>
                {expandedReleaseId === entry.release_id && (
                  <div style={expandedStyle}>
                    {expandedLoading ? (
                      <SkeletonBlock lines={2} gap={spacing[1]} />
                    ) : expandedRelease ? (
                      <div style={{ ...typeScale.caption, lineHeight: "16px" }}>
                        <div>Graph: {expandedRelease.graph.name}</div>
                        <div>
                          Nodes: {expandedRelease.graph.nodes.length} · Edges: {expandedRelease.graph.edges.length}
                        </div>
                        <div>Resources embedded: {Object.keys(expandedRelease.resource_snapshots).length}</div>
                        {expandedRelease.release_notes && <div>Notes: {expandedRelease.release_notes}</div>}
                        {expandedRelease.author && <div>Author: {expandedRelease.author}</div>}
                        <div style={{ opacity: 0.6, marginTop: spacing[1] }}>
                          Document fingerprint: <span style={monoStyle}>{expandedRelease.document_fingerprint}</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ ...typeScale.caption, opacity: 0.6 }}>Could not load release details.</div>
                    )}
                  </div>
                )}
              </div>
            ))
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

const labelStyle: CSSProperties = { ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] };
const warningTextStyle: CSSProperties = {
  ...typeScale.caption,
  color: color.warning[500],
  marginBottom: spacing[2],
  lineHeight: "16px",
};
const errorTextStyle: CSSProperties = {
  ...typeScale.caption,
  color: accentSurface.destructive.text,
  lineHeight: "16px",
};
const resultTextStyle: CSSProperties = {
  ...typeScale.caption,
  color: color.primary[500],
  marginTop: spacing[2],
  lineHeight: "16px",
};
const emptyTextStyle: CSSProperties = { ...typeScale.caption, opacity: 0.6, lineHeight: "18px" };
const monoStyle: CSSProperties = { fontFamily: fontFamily.mono };
const rowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: spacing[2] };

const releaseButtonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: shell.touchTarget.min,
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  cursor: "pointer",
  textAlign: "left",
  ...typeScale.caption,
};

const expandedStyle: CSSProperties = {
  padding: spacing[2],
  background: surface.page,
  borderRadius: radius.lg,
  marginTop: spacing[1],
};
