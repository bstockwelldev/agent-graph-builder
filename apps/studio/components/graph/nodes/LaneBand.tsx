import type { Node, NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import { LANE_LABEL_WIDTH } from "@/lib/graphLayers";
import { text, typeScale } from "@/lib/graph-theme";

export type LaneBandData = { label: string; color: string; count: number };

/**
 * Layers view (large-graph complexity, Wave 7d / STO-622): one horizontal
 * swimlane band behind the nodes of an architecture layer. Purely a
 * derived React Flow node -- never saved, never selectable.
 */
export function LaneBand({ data }: NodeProps<Node<LaneBandData>>) {
  return (
    <div role="group" aria-label={`Layer ${data.label}`} data-testid="lane-band" style={{ ...bandStyle, borderColor: `${data.color}66`, background: `${data.color}10` }}>
      <div style={{ width: LANE_LABEL_WIDTH - 16, padding: "12px 12px", borderRight: `2px solid ${data.color}` }}>
        <div style={{ ...typeScale.small, fontWeight: 700, color: data.color }}>{data.label}</div>
        <div style={{ ...typeScale.caption, color: text.secondary }}>
          {data.count} node{data.count === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

const bandStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: "solid",
  pointerEvents: "none",
  display: "flex",
};
