"use client";

import type { CSSProperties } from "react";
import { HEAT_METRICS, heatColor, type HeatMetric, type Lane } from "@/lib/graphLayers";
import { radius, shadow, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { SegmentedControl } from "./ui/SegmentedControl";

/**
 * Canvas overlay for the Wave 7d views (STO-622): lane filter chips in the
 * Layers view, and the metric picker + colour legend in the Heatmap view.
 */
export function ViewOverlay({
  view,
  lanes,
  hiddenLayers,
  onToggleLayer,
  onManageLayers,
  metric,
  onMetricChange,
  heatStatus,
}: {
  view: "layers" | "heatmap";
  lanes: (Pick<Lane, "id" | "label" | "color" | "count">)[];
  hiddenLayers: ReadonlySet<string>;
  onToggleLayer: (layerId: string) => void;
  onManageLayers: () => void;
  metric: HeatMetric;
  onMetricChange: (metric: HeatMetric) => void;
  /** e.g. "12 runs" or "No runs yet" */
  heatStatus: string;
}) {
  if (view === "layers") {
    return (
      <div role="toolbar" aria-label="Layer filters" style={barStyle}>
        {lanes.map((lane) => {
          const hidden = hiddenLayers.has(lane.id);
          return (
            <button
              key={lane.id}
              type="button"
              aria-pressed={!hidden}
              className="agb-focus-ring agb-hoverable"
              onClick={() => onToggleLayer(lane.id)}
              style={{ ...chipStyle, borderColor: lane.color, opacity: hidden ? 0.45 : 1, textDecoration: hidden ? "line-through" : "none" }}
            >
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: lane.color }} />
              {lane.label} · {lane.count}
            </button>
          );
        })}
        <button type="button" className="agb-focus-ring agb-hoverable" style={{ ...chipStyle, borderStyle: "dashed" }} onClick={onManageLayers}>
          Manage layers…
        </button>
        <span style={{ ...typeScale.caption, color: text.secondary }}>Switch to Canvas to rearrange.</span>
      </div>
    );
  }
  return (
    <div role="toolbar" aria-label="Heatmap" style={barStyle}>
      <SegmentedControl aria-label="Heatmap metric" options={HEAT_METRICS} value={metric} onChange={onMetricChange} />
      <div aria-label="Heat legend" style={{ display: "flex", alignItems: "center", gap: 6, ...typeScale.caption, color: text.secondary }}>
        low
        <span
          aria-hidden="true"
          style={{ width: 96, height: 8, borderRadius: 999, background: `linear-gradient(90deg, ${heatColor(0, 1)}, ${heatColor(0.5, 1)}, ${heatColor(1, 1)})` }}
        />
        high · grey = no data · {heatStatus}
      </div>
    </div>
  );
}

const barStyle: CSSProperties = {
  position: "absolute",
  // Centered without left:50% so the bar gets the full pane width to wrap
  // in (the translate trick halves it, stacking chips on phones).
  left: 0,
  right: 0,
  margin: "0 auto",
  width: "fit-content",
  bottom: 72,
  zIndex: 5,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing[2],
  maxWidth: "calc(100% - 32px)",
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderRadius: radius.xl,
  border: `1px solid ${surface.border}`,
  background: surface.panel,
  boxShadow: shadow[4],
};
const chipStyle: CSSProperties = {
  ...typeScale.caption,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 10px",
  borderRadius: 999,
  border: "1px solid",
  background: surface.raised,
  color: text.primary,
  cursor: "pointer",
};
