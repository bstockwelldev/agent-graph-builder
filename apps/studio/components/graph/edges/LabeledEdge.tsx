"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { EdgeKind } from "@bstockwelldev/agent-graph-sdk";
import { flowEdgeLabel } from "@/lib/graphAuthoring";
import { color, radius, surface, text } from "@/lib/graph-theme";
import { useCanvasActions } from "../canvasActions";

/** Run-derived edge state (studio-graph-workbench-redesign-plan.md, Slice 6). */
export type EdgeRunState = "traversed" | "failed" | "active";

export type LabeledEdgeData = {
  kind?: EdgeKind;
  condition?: string | null;
  runState?: EdgeRunState;
  /** Wave 7b: edges merged onto a collapsed group's card (badge "×N"). */
  mergedCount?: number;
};

/**
 * Default edge renderer. Replaces React Flow's stock edge + `label` so that:
 * - sequence edges carry no label (they used to say "Always" on every one);
 * - conditional/fallback edges get a compact, clickable chip;
 * - animation means "executing right now" (`runState: "active"`), not
 *   "this edge is conditional" -- conditional edges used to be permanently
 *   animated, so motion carried no runtime meaning;
 * - edges into a failed node read as failed (red), not just unhighlighted.
 *
 * Stroke color/width still come from `style`, which lib/diagnostics.ts
 * (kind + validation issue) and lib/runInspection.ts (executed path) set.
 */
export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  selected,
  interactionWidth,
}: EdgeProps) {
  const edgeData = (data ?? {}) as LabeledEdgeData;
  const actions = useCanvasActions();
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const merged = (edgeData.mergedCount ?? 1) > 1 ? edgeData.mergedCount : null;
  const label = merged ? `×${merged}` : flowEdgeLabel(edgeData.kind ?? "sequence", edgeData.condition);
  const runState = edgeData.runState;

  const edgeStyle: CSSProperties = {
    ...style,
    ...(runState === "failed" ? { stroke: color.error[500], strokeWidth: 2.5 } : {}),
    ...(selected ? { strokeWidth: Math.max(Number(style?.strokeWidth ?? 1.5), 2.5) } : {}),
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={edgeStyle}
        interactionWidth={interactionWidth}
        className={runState === "active" ? "agb-edge-active" : undefined}
      />
      {label && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan agb-focus-ring"
            onClick={(event) => {
              event.stopPropagation();
              actions.selectEdge(id);
            }}
            aria-label={merged ? `${merged} edges into collapsed group` : `Edge: ${label}`}
            title={merged ? `${merged} edges merged at a collapsed group` : label}
            style={{
              ...chipStyle,
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              borderColor: selected ? color.primary[500] : String(edgeStyle.stroke ?? surface.borderStrong),
              color: runState === "failed" ? color.error[500] : text.primary,
            }}
          >
            {label}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const chipStyle: CSSProperties = {
  position: "absolute",
  pointerEvents: "all",
  maxWidth: 160,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  padding: "1px 8px",
  borderRadius: radius.xl,
  border: "1px solid",
  background: surface.panel,
  fontSize: 11,
  lineHeight: "16px",
  fontWeight: 500,
  cursor: "pointer",
};
