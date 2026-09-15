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

const legendStyle: CSSProperties = {
  position: "absolute",
  left: spacing[3],
  bottom: spacing[3],
  zIndex: 12,
  display: "flex",
  flexWrap: "wrap",
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
