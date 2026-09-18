import type { CSSProperties } from "react";
import { EDGE_KIND_TAXONOMY } from "@/content/taxonomy";
import { color, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";

const KINDS = ["sequence", "conditional", "default"] as const;

export function CanvasEdgeLegend({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div style={legendStyle} role="note" aria-label="Edge kinds">
      {KINDS.map((kind) => (
        <span key={kind} style={itemStyle}>
          <strong>{EDGE_KIND_TAXONOMY[kind].title}</strong>
          <span style={{ opacity: 0.7 }}> {EDGE_KIND_TAXONOMY[kind].summary}</span>
        </span>
      ))}
    </div>
  );
}

// Anchored bottom-center, not bottom-left — ReactFlow's own `<Controls>`
// (zoom in/out/fit-view) defaults to bottom-left at the same offset, and
// the two collided directly (a reported overlap bug). Bottom-right is
// `<MiniMap>`'s spot. Centering avoids both without hardcoding either's
// pixel footprint.
const legendStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
  bottom: spacing[3],
  zIndex: 12,
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: spacing[2],
  maxWidth: 420,
  padding: `${spacing[1]}px ${spacing[2]}px`,
  borderRadius: radius.lg,
  border: `1px solid ${surface.border}`,
  background: color.neutral[900],
  color: text.primary,
  pointerEvents: "none",
  ...typeScale.caption,
};

const itemStyle: CSSProperties = {
  display: "inline-block",
};
