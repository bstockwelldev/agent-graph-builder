import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import type {
  Diagnostic,
  GraphDefinition,
  GraphElementChange,
  GraphRelease,
  ReleaseDiff,
  ReleaseIndexEntry,
} from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { hasBlockingErrors } from "@/lib/diagnostics";
import { accentSurface, color, fontFamily, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { SkeletonBlock } from "./ui/Skeleton";
import { TextArea, TextInput } from "./ui/fields";
import { blockingDiagnostics, errorDetail } from "@/lib/apiErrors";

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
  getDraftGraph,
  layout = "rail",
  reducedMotion = false,
}: {
  graphId: string;
  diagnostics: Diagnostic[];
  /** A release always publishes the saved draft (`storage.get_graph`), not
   * unsaved canvas edits — publishing is disabled while dirty rather than
   * silently publishing something other than what's on screen. */
  dirty: boolean;
  /** The live canvas graph (unsaved edits included), for "Diff vs draft" (STO-609). */
  getDraftGraph?: () => GraphDefinition;
  layout?: "rail" | "drawer";
  reducedMotion?: boolean;
}) {
  const [releaseNotes, setReleaseNotes] = useState("");
  const [author, setAuthor] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishBlockers, setPublishBlockers] = useState<Diagnostic[]>([]);
  const [lastResult, setLastResult] = useState<{ release: GraphRelease; created: boolean } | null>(null);

  const [releases, setReleases] = useState<ReleaseIndexEntry[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releasesError, setReleasesError] = useState<string | null>(null);

  const [expandedReleaseId, setExpandedReleaseId] = useState<string | null>(null);
  const [expandedRelease, setExpandedRelease] = useState<GraphRelease | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  // P1 rollout plan, Slice A ("Semantic release comparison"): pick up to two
  // releases from the history list below to diff. Selection order is
  // preserved (first pick = from, second = to) so the diff reads in the
  // order the user compared them, not creation order.
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareDiff, setCompareDiff] = useState<ReleaseDiff | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const blocked = hasBlockingErrors(diagnostics);

  const refreshReleases = useCallback(async () => {
    setReleasesLoading(true);
    setReleasesError(null);
    try {
      const loaded = await client.listReleases(graphId);
      setReleases([...loaded].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      setReleasesError(errorDetail(err));
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
    setPublishBlockers([]);
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
      // SDK 1/7: a blocked publish is a typed AgentGraphApiError whose
      // `diagnostics` list each blocker (e.g. RELEASE_SUBGRAPH_UNPUBLISHED).
      const blockers = blockingDiagnostics(err);
      setPublishBlockers(blockers);
      setPublishError(blockers.length > 0 ? `Publish blocked by ${blockers.length} issue${blockers.length === 1 ? "" : "s"}:` : errorDetail(err));
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

  const toggleCompareSelection = useCallback((releaseId: string) => {
    setCompareIds((current) => {
      if (current.includes(releaseId)) return current.filter((id) => id !== releaseId);
      if (current.length < 2) return [...current, releaseId];
      // Already have two picked — replace the first pick, keep the second.
      return [current[1], releaseId];
    });
  }, []);

  // STO-609: a release vs the live canvas (unsaved edits included).
  const [draftDiff, setDraftDiff] = useState<{ releaseId: string; diff: ReleaseDiff | null; loading: boolean; error: string | null } | null>(null);
  const handleDiffDraft = useCallback(
    async (releaseId: string) => {
      if (!getDraftGraph) return;
      setDraftDiff({ releaseId, diff: null, loading: true, error: null });
      try {
        const diff = await client.compareDraftToRelease(releaseId, getDraftGraph());
        setDraftDiff({ releaseId, diff, loading: false, error: null });
      } catch (err) {
        setDraftDiff({ releaseId, diff: null, loading: false, error: errorDetail(err) });
      }
    },
    [getDraftGraph],
  );

  useEffect(() => {
    if (compareIds.length !== 2) {
      setCompareDiff(null);
      setCompareError(null);
      return;
    }
    let cancelled = false;
    setCompareLoading(true);
    setCompareError(null);
    void client
      .compareReleases(compareIds[0], compareIds[1])
      .then((diff) => {
        if (!cancelled) setCompareDiff(diff);
      })
      .catch((err) => {
        if (!cancelled) setCompareError(errorDetail(err));
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compareIds]);

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
          {publishError && (
            <div role="alert" style={{ ...errorTextStyle, marginTop: spacing[2] }}>
              {publishError}
              {publishBlockers.length > 0 && (
                <ul style={{ margin: `${spacing[1]}px 0 0`, paddingLeft: spacing[4] }}>
                  {publishBlockers.map((diagnostic, index) => (
                    <li key={`${diagnostic.code}-${index}`}>
                      <code>{diagnostic.code}</code> {diagnostic.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                <div style={{ display: "flex", alignItems: "flex-start", gap: spacing[1] }}>
                  <label style={compareCheckboxLabelStyle} title="Select to compare (up to two releases)">
                    <input
                      type="checkbox"
                      checked={compareIds.includes(entry.release_id)}
                      onChange={() => toggleCompareSelection(entry.release_id)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleToggleRelease(entry.release_id)}
                    aria-expanded={expandedReleaseId === entry.release_id}
                    style={{ ...releaseButtonStyle, flex: 1 }}
                  >
                    <div style={rowStyle}>
                      <span style={{ ...monoStyle, fontWeight: 600 }}>{shortId(entry.release_id)}</span>
                      <span style={{ opacity: 0.6 }}>{formatTimestamp(entry.created_at)}</span>
                    </div>
                    <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[1], ...monoStyle }}>
                      {entry.semantic_fingerprint.slice(0, 16)}
                    </div>
                  </button>
                </div>
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
                        {getDraftGraph && (
                          <div style={{ marginTop: spacing[2] }}>
                            <Button variant="secondary" onClick={() => void handleDiffDraft(entry.release_id)} disabled={draftDiff?.loading}>
                              Diff vs draft
                            </Button>
                          </div>
                        )}
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

        {draftDiff && (
          <CollapsibleSection sectionId="releases-draft-diff" title="Draft vs release" reducedMotion={reducedMotion}>
            {draftDiff.loading ? (
              <SkeletonBlock lines={3} gap={spacing[2]} />
            ) : draftDiff.error ? (
              <div style={errorTextStyle}>{draftDiff.error}</div>
            ) : draftDiff.diff ? (
              <div aria-label="Draft vs release diff">
                <div style={{ ...typeScale.caption, marginBottom: spacing[2] }}>
                  <span style={monoStyle}>{shortId(draftDiff.releaseId)}</span>
                  {" → "}
                  <span style={{ fontWeight: 600 }}>Draft{dirty ? " (unsaved)" : ""}</span>
                </div>
                {draftDiff.diff.identical ? (
                  <div style={resultTextStyle}>No behavior changes since this release.</div>
                ) : (
                  <>
                    <ChangeList title="Nodes" changes={draftDiff.diff.node_changes} />
                    <ChangeList title="Edges" changes={draftDiff.diff.edge_changes} />
                    <ChangeList title="Resources" changes={draftDiff.diff.resource_changes} />
                  </>
                )}
                <Button variant="ghost" onClick={() => setDraftDiff(null)}>
                  Close
                </Button>
              </div>
            ) : null}
          </CollapsibleSection>
        )}

        {compareIds.length > 0 && (
          <CollapsibleSection sectionId="releases-compare" title="Compare releases" reducedMotion={reducedMotion}>
            {compareIds.length === 1 ? (
              <div style={emptyTextStyle}>
                Pick a second release above to compare against <span style={monoStyle}>{shortId(compareIds[0])}</span>.
              </div>
            ) : compareLoading ? (
              <SkeletonBlock lines={3} gap={spacing[2]} />
            ) : compareError ? (
              <div style={errorTextStyle}>{compareError}</div>
            ) : compareDiff ? (
              <div>
                <div style={{ ...typeScale.caption, marginBottom: spacing[2] }}>
                  <span style={monoStyle}>{shortId(compareDiff.from_release_id)}</span>
                  {" → "}
                  <span style={monoStyle}>{compareDiff.to_release_id ? shortId(compareDiff.to_release_id) : (compareDiff.to_label ?? "Draft")}</span>
                </div>
                {compareDiff.identical ? (
                  <div style={resultTextStyle}>Identical — same semantic_fingerprint, no behavior changes.</div>
                ) : (
                  <>
                    <ChangeList title="Nodes" changes={compareDiff.node_changes} />
                    <ChangeList title="Edges" changes={compareDiff.edge_changes} />
                    <ChangeList title="Resources" changes={compareDiff.resource_changes} />
                  </>
                )}
              </div>
            ) : null}
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

function ChangeList({ title, changes }: { title: string; changes: GraphElementChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div style={{ marginBottom: spacing[2] }}>
      <div style={{ ...typeScale.caption, fontWeight: 600, marginBottom: spacing[1] }}>
        {title} ({changes.length})
      </div>
      {changes.map((change) => (
        <div key={change.id} style={changeRowStyle}>
          <div style={rowStyle}>
            <span style={monoStyle}>{shortId(change.id)}</span>
            <span style={{ ...changeBadgeStyle, ...changeBadgeVariant(change.change) }}>{change.change}</span>
          </div>
          {change.change === "modified" &&
            Object.entries(change.fields).map(([field, delta]) => (
              <div key={field} style={{ ...typeScale.caption, opacity: 0.75, marginTop: spacing[1] }}>
                <span style={{ fontWeight: 600 }}>{field}</span>: {formatDeltaValue(delta.from)} {"→"}{" "}
                {formatDeltaValue(delta.to)}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function formatDeltaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function changeBadgeVariant(change: GraphElementChange["change"]): CSSProperties {
  if (change === "added") return { color: color.primary[500] };
  if (change === "removed") return { color: accentSurface.destructive.text };
  return { color: color.warning[500] };
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

const compareCheckboxLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  minHeight: shell.touchTarget.min,
  paddingTop: spacing[2],
};

const changeRowStyle: CSSProperties = {
  padding: spacing[2],
  borderRadius: radius.md,
  background: surface.raised,
  border: `1px solid ${surface.border}`,
  marginBottom: spacing[1],
};

const changeBadgeStyle: CSSProperties = {
  ...typeScale.caption,
  fontWeight: 600,
  textTransform: "uppercase",
};
