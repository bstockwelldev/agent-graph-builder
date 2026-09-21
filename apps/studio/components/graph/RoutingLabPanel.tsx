import type { CSSProperties } from "react";
import { useCallback, useState } from "react";
import type { RouteNodeDistributionDelta, RoutingComparison, RoutingLabReport } from "@bstockwelldev/agent-graph-sdk";

import { client } from "@/lib/api-client";
import { color, fontFamily, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { SkeletonBlock } from "./ui/Skeleton";
import { TextArea, TextInput } from "./ui/fields";

// P1 rollout plan, Slice D Studio UI
// (docs/planning/features/p1-rollout-plan.md): runs a fixture dataset
// against the current graph — and optionally a second graph, to compare
// routing versions — and shows the resulting route-decision distribution.
// Mirrors ReleasesPanel.tsx's docked-rail layout/style conventions.

const DEFAULT_DATASET_TEXT = JSON.stringify(
  [
    { input: { question: "how does a database index work" }, node_outputs: {} },
    { input: { question: "what's your favorite color" }, node_outputs: {} },
  ],
  null,
  2,
);

function shortId(id: string, length = 14): string {
  return id.length > length ? `${id.slice(0, length)}…` : id;
}

function DistributionView({ report }: { report: RoutingLabReport }) {
  return (
    <div>
      <div style={{ ...typeScale.caption, opacity: 0.7, marginBottom: spacing[2] }}>
        {report.dataset_size} fixture{report.dataset_size === 1 ? "" : "s"} · est.{" "}
        {report.total_estimated_usd > 0 ? `$${report.total_estimated_usd.toFixed(4)}` : "$0 (stub provider)"}
      </div>
      {report.distributions.length === 0 ? (
        <div style={{ ...typeScale.caption, opacity: 0.6 }}>No router/branch decisions recorded.</div>
      ) : (
        report.distributions.map((distribution) => (
          <div key={distribution.node_id} style={distributionRowStyle}>
            <div style={{ ...typeScale.caption, fontWeight: 600, ...monoStyle }}>{distribution.node_id}</div>
            {distribution.targets.map((target) => (
              <div key={target.target_node_id} style={{ ...typeScale.caption, opacity: 0.8, marginTop: spacing[1] }}>
                <span style={monoStyle}>{target.target_node_id}</span>: {target.count}/{distribution.total}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function ComparisonView({ comparison }: { comparison: RoutingComparison }) {
  return (
    <div style={{ marginTop: spacing[2] }}>
      <div style={{ ...typeScale.caption, fontWeight: 600, marginBottom: spacing[1] }}>Distribution shift</div>
      {comparison.distribution_deltas.length === 0 ? (
        <div style={{ ...typeScale.caption, opacity: 0.6 }}>No router/branch decisions recorded in either report.</div>
      ) : (
        comparison.distribution_deltas.map((delta: RouteNodeDistributionDelta) => (
          <div key={delta.node_id} style={distributionRowStyle}>
            <div style={{ ...typeScale.caption, fontWeight: 600, ...monoStyle }}>{delta.node_id}</div>
            {delta.targets.map((target) => (
              <div key={target.target_node_id} style={{ ...typeScale.caption, opacity: 0.8, marginTop: spacing[1] }}>
                <span style={monoStyle}>{target.target_node_id}</span>: {target.baseline_count} {"→"}{" "}
                <span
                  style={{
                    fontWeight: target.candidate_count !== target.baseline_count ? 700 : 400,
                    color: target.candidate_count !== target.baseline_count ? color.warning[500] : undefined,
                  }}
                >
                  {target.candidate_count}
                </span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export function RoutingLabPanel({
  graphId,
  layout = "rail",
  reducedMotion = false,
}: {
  graphId: string | null;
  layout?: "rail" | "drawer";
  reducedMotion?: boolean;
}) {
  const [datasetText, setDatasetText] = useState(DEFAULT_DATASET_TEXT);
  const [otherGraphId, setOtherGraphId] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RoutingLabReport | null>(null);
  const [comparison, setComparison] = useState<RoutingComparison | null>(null);

  const parseDataset = useCallback(() => {
    const parsed = JSON.parse(datasetText || "[]");
    if (!Array.isArray(parsed)) throw new Error("Dataset must be a JSON array of fixtures");
    return parsed as Array<{ input: Record<string, unknown>; node_outputs: Record<string, unknown> }>;
  }, [datasetText]);

  const handleRun = useCallback(async () => {
    if (!graphId) return;
    setRunning(true);
    setError(null);
    setComparison(null);
    try {
      const dataset = parseDataset();
      const result = await client.runRoutingDataset(graphId, dataset);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [graphId, parseDataset]);

  const handleCompare = useCallback(async () => {
    if (!graphId || !otherGraphId.trim()) return;
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const dataset = parseDataset();
      const result = await client.compareRoutingDatasets(graphId, otherGraphId.trim(), dataset);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [graphId, otherGraphId, parseDataset]);

  return (
    <div style={containerStyle(layout)}>
      <div style={scrollerStyle}>
        <CollapsibleSection sectionId="routing-lab-dataset" title="Dataset" reducedMotion={reducedMotion}>
          <div style={{ ...typeScale.caption, opacity: 0.7, lineHeight: "16px", marginBottom: spacing[2] }}>
            A JSON array of fixtures — each a Slice B <code style={monoStyle}>{"{input, node_outputs}"}</code> pair.
            No live tool or model calls are made; the offline stub provider runs every fixture.
          </div>
          <TextArea
            rows={8}
            style={{ minHeight: 140, resize: "vertical", fontFamily: fontFamily.mono }}
            value={datasetText}
            onChange={(e) => setDatasetText(e.target.value)}
            disabled={running}
          />
          <div style={{ marginTop: spacing[2] }}>
            <Button variant="primary" disabled={!graphId || running} onClick={() => void handleRun()} style={{ minHeight: shell.touchTarget.min }}>
              {running ? "Running…" : "Run dataset"}
            </Button>
          </div>
          <div style={{ ...typeScale.caption, opacity: 0.6, marginTop: spacing[2], marginBottom: spacing[1] }}>
            Compare against another graph id (optional)
          </div>
          <div style={{ display: "flex", gap: spacing[2] }}>
            <TextInput
              value={otherGraphId}
              onChange={(e) => setOtherGraphId(e.target.value)}
              placeholder="graph id to compare against"
              disabled={running}
            />
            <Button
              variant="secondary"
              disabled={!graphId || !otherGraphId.trim() || running}
              onClick={() => void handleCompare()}
              style={{ minHeight: shell.touchTarget.min, whiteSpace: "nowrap" }}
            >
              Compare
            </Button>
          </div>
          {error && (
            <div style={{ ...typeScale.caption, color: color.warning[500], marginTop: spacing[2], lineHeight: "16px" }}>
              {error}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection sectionId="routing-lab-results" title="Route distribution" defaultOpen reducedMotion={reducedMotion}>
          {running ? (
            <SkeletonBlock lines={3} gap={spacing[2]} />
          ) : comparison ? (
            <div>
              <div style={{ ...typeScale.caption, marginBottom: spacing[2] }}>
                <span style={monoStyle}>{shortId(comparison.baseline.graph_id)}</span>
                {" (baseline) → "}
                <span style={monoStyle}>{shortId(comparison.candidate.graph_id)}</span>
                {" (candidate)"}
              </div>
              <ComparisonView comparison={comparison} />
            </div>
          ) : report ? (
            <DistributionView report={report} />
          ) : (
            <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
              Run a dataset above to see how often each router/branch node selects each target.
            </div>
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

const distributionRowStyle: CSSProperties = {
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  marginBottom: spacing[2],
};
