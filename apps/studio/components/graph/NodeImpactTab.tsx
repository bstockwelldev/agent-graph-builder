"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { BindableResourceKind, GraphDefinition, NodeImpact } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { color, fontFamily, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { relativeTime } from "@/lib/nodeMetrics";
import { versionLabel } from "@bstockwelldev/agent-graph-sdk/graph";
import { SkeletonBlock } from "./ui/Skeleton";

/**
 * NodeInspector "Impact" tab (large-graph complexity, Wave 7a / STO-610):
 * the blast radius of changing this node -- what it reaches downstream,
 * routing that may shift, resources it pulls in, how often it runs, which
 * releases contain it (and whether the draft has changed it since), and
 * datasets that stub it. Computed against the live canvas; the downstream
 * set is highlighted on the canvas while the tab is open.
 */
export function NodeImpactTab({
  graphId,
  nodeId,
  getDraftGraph,
  refreshKey,
  onSelectNode,
  onOpenResource,
  onOpenReleases,
  onHighlight,
}: {
  graphId: string;
  nodeId: string;
  getDraftGraph: () => GraphDefinition;
  refreshKey?: string | null;
  onSelectNode?: (nodeId: string) => void;
  onOpenResource?: (kind: BindableResourceKind, resourceId: string) => void;
  onOpenReleases?: () => void;
  /** Node ids to keep lit on the canvas (this node + downstream), or null to clear. */
  onHighlight?: (nodeIds: string[] | null) => void;
}) {
  const [impact, setImpact] = useState<NodeImpact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    client
      .graphs.impact(graphId, { nodeId, draft: getDraftGraph() })
      .then((result) => {
        if (cancelled) return;
        setImpact(result);
        onHighlight?.([nodeId, ...result.downstream]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // getDraftGraph is a live closure; refetch on node/graph/refresh only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId, nodeId, refreshKey]);

  useEffect(() => () => onHighlight?.(null), [onHighlight]);

  if (error) return <div role="alert" style={{ ...typeScale.caption, color: color.warning[500] }}>{error}</div>;
  if (!impact || impact.node_id !== nodeId) return <SkeletonBlock lines={4} gap={spacing[2]} />;

  return (
    <div aria-label="Node impact">
      <div style={{ ...typeScale.caption, fontWeight: 600, marginBottom: spacing[2], lineHeight: "18px" }}>
        {impact.downstream.length === 0
          ? "Nothing downstream — changing this node only affects itself."
          : `Changing this node reaches ${impact.downstream.length} node${impact.downstream.length === 1 ? "" : "s"} · ${impact.outputs_reached.length} output${impact.outputs_reached.length === 1 ? "" : "s"}`}
        <span style={{ fontWeight: 400, color: text.secondary }}> · {impact.upstream_count} upstream</span>
      </div>

      {impact.routers_downstream.length > 0 && (
        <Section title="Routing that may change">
          {impact.routers_downstream.map((id) => (
            <NodeLink key={id} id={id} onSelect={onSelectNode} tone={color.warning[500]} />
          ))}
        </Section>
      )}

      {impact.downstream.length > 0 && (
        <Section title={`Downstream (${impact.downstream.length})`}>
          {impact.downstream.map((id) => (
            <NodeLink key={id} id={id} onSelect={onSelectNode} />
          ))}
        </Section>
      )}

      {impact.uses_graph && (
        <Section title="Uses graph">
          <a href={`/graphs/${encodeURIComponent(impact.uses_graph.graph_id)}`} className="agb-focus-ring agb-hoverable" style={{ ...linkStyle, textDecoration: "none" }}>
            {impact.uses_graph.name ?? impact.uses_graph.graph_id}
            <span style={{ color: text.secondary }}> · {versionLabel(impact.uses_graph.version)}</span>
          </a>
        </Section>
      )}

      {impact.bindings.length > 0 && (
        <Section title="Resources it pulls in">
          {impact.bindings.map((binding) => (
            <button
              key={`${binding.kind}:${binding.resource_id}`}
              type="button"
              className="agb-focus-ring agb-hoverable"
              style={linkStyle}
              onClick={() => onOpenResource?.(binding.kind as BindableResourceKind, binding.resource_id)}
            >
              <span style={{ color: text.secondary }}>{binding.kind} · </span>
              <span style={{ fontFamily: fontFamily.mono }}>{binding.resource_id}</span>
            </button>
          ))}
        </Section>
      )}

      <Section title="Runs">
        <div style={{ ...typeScale.caption, color: text.secondary }}>
          {impact.runs.executions === 0
            ? "Hasn't run in recent history."
            : `Executed ${impact.runs.executions} time${impact.runs.executions === 1 ? "" : "s"}${impact.runs.last_run_at ? ` · last ${relativeTime(impact.runs.last_run_at)}` : ""}`}
        </div>
      </Section>

      <Section title="Releases">
        {impact.releases.length === 0 ? (
          <div style={{ ...typeScale.caption, color: text.secondary }}>Not in any published release yet.</div>
        ) : (
          impact.releases.map((release) => (
            <button key={release.release_id} type="button" className="agb-focus-ring agb-hoverable" style={linkStyle} onClick={onOpenReleases}>
              <span style={{ fontFamily: fontFamily.mono }}>{release.release_id}</span>{" "}
              <span style={{ ...chipStyle, color: release.changed_since ? color.warning[500] : text.secondary, borderColor: release.changed_since ? color.warning[500] : surface.borderStrong }}>
                {release.changed_since ? "changed since" : "unchanged"}
              </span>
            </button>
          ))
        )}
      </Section>

      {impact.datasets.length > 0 && (
        <Section title="Datasets that stub this node">
          {impact.datasets.map((dataset) => (
            <div key={dataset.dataset_id} style={{ ...typeScale.caption, color: text.secondary }}>
              {dataset.name}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} style={sectionStyle}>
      <div style={{ ...typeScale.caption, fontWeight: 600, marginBottom: spacing[1] }}>{title}</div>
      {children}
    </section>
  );
}

function NodeLink({ id, onSelect, tone }: { id: string; onSelect?: (id: string) => void; tone?: string }) {
  return (
    <button type="button" className="agb-focus-ring agb-hoverable" style={{ ...linkStyle, fontFamily: fontFamily.mono, color: tone ?? text.primary }} onClick={() => onSelect?.(id)}>
      {id}
    </button>
  );
}

const sectionStyle: CSSProperties = { padding: spacing[2], borderRadius: radius.lg, border: `1px solid ${surface.borderStrong}`, background: surface.raised, marginBottom: spacing[2] };
const linkStyle: CSSProperties = {
  ...typeScale.caption,
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  padding: "2px 4px",
  borderRadius: radius.md,
  color: text.primary,
  cursor: "pointer",
};
const chipStyle: CSSProperties = { fontSize: 11, padding: "0 6px", borderRadius: 999, border: "1px solid", whiteSpace: "nowrap" };
