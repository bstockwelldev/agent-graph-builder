import type { CSSProperties } from "react";
import { TaxonomyTooltip } from "./Tooltip";
import type { GraphOrientation } from "../types";
import { radius, shell, spacing, surface, text, typeScale } from "../theme";

const OPTIONS: { value: GraphOrientation; label: string; title: string; details: string }[] = [
  {
    value: "auto",
    label: "Auto",
    title: "Auto orientation",
    details:
      "Relayouts from the canvas pane shape: vertical when the pane is portrait or narrower than 420px, otherwise horizontal. Manual node positions are replaced when Auto relayout runs.",
  },
  {
    value: "horizontal",
    label: "H",
    title: "Horizontal layout",
    details: "Pins left-to-right dagre layout regardless of pane size. Outgoing handles stay on the right.",
  },
  {
    value: "vertical",
    label: "V",
    title: "Vertical layout",
    details: "Pins top-to-bottom dagre layout regardless of pane size. Outgoing handles stay on the bottom.",
  },
];

export function OrientationControl({
  value,
  onChange,
  onRelayout,
}: {
  value: GraphOrientation;
  onChange: (orientation: GraphOrientation) => void;
  onRelayout?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[2] }}>
      <TaxonomyTooltip
        layout="inline"
        title="Graph orientation"
        summary="Auto, horizontal, or vertical dagre layout"
        details="Auto follows the canvas pane aspect ratio. Horizontal (H) and vertical (V) pin layout direction until you select Auto again. Relayout runs dagre without changing orientation."
      >
        <span style={{ ...typeScale.caption, opacity: 0.6 }}>Orientation</span>
      </TaxonomyTooltip>
      <div role="radiogroup" aria-label="Graph orientation" style={{ display: "inline-flex", gap: spacing[1] }}>
        {OPTIONS.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={option.title}
              onClick={() => onChange(option.value)}
              style={segmentStyle(active)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {onRelayout && (
        <button type="button" onClick={onRelayout} title="Run dagre layout on current nodes" style={segmentStyle(false)}>
          Relayout
        </button>
      )}
    </div>
  );
}

function segmentStyle(active: boolean): CSSProperties {
  return {
    minWidth: shell.touchTarget.min,
    minHeight: shell.touchTarget.min,
    padding: `0 ${spacing[2]}px`,
    borderRadius: radius.lg,
    border: `1px solid ${active ? surface.borderStrong : surface.border}`,
    background: active ? surface.raised : "transparent",
    color: text.primary,
    cursor: "pointer",
    ...typeScale.caption,
    fontWeight: 600,
  };
}
