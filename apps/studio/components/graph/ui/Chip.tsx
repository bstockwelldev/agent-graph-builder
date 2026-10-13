import type { CSSProperties, HTMLAttributes } from "react";
import { accentSurface, border, color, radius, surface, text, typeScale } from "@/lib/graph-theme";

export type ChipTone = "neutral" | "success" | "warning" | "danger";

const TONE: Record<ChipTone, Pick<CSSProperties, "background" | "borderColor" | "color">> = {
  neutral: { background: surface.card, borderColor: border.subtle, color: text.secondary },
  success: { background: accentSurface.successAction.bg, borderColor: accentSurface.successAction.border, color: color.success[500] },
  warning: { background: "#33290f", borderColor: "#5c4a17", color: color.warning[500] },
  danger: { background: accentSurface.destructive.bg, borderColor: accentSurface.destructive.border, color: accentSurface.destructive.text },
};

/** A small status or tag pill in the canvas's tokens. Replaces the shadcn Badge. */
export function Chip({ tone = "neutral", style, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  const toneStyle = TONE[tone];
  return (
    <span
      {...props}
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: radius.md,
        border: "1px solid",
        whiteSpace: "nowrap",
        ...typeScale.caption,
        ...toneStyle,
        ...style,
      }}
    />
  );
}
