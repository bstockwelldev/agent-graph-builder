import { useEffect, type CSSProperties } from "react";
import { color, radius, shadow, shell, spacing, text, typeScale } from "@/lib/graph-theme";
import type { CoachStep } from "@/lib/graphAuthoring";
import { Button } from "./ui/Button";

// Bug fix: this panel used to sit at a fixed `top: spacing[3]` (12px),
// which is inside the same absolute-position coordinate frame as
// GraphEditor's floating top HUD — the two collided (the HUD renders on
// top of the coach panel, per its higher z-index, but the panel's own text
// bled out from behind/around it). `hudBottom` is the HUD's real measured
// bottom edge (see GraphEditor's `useLayoutEffect`), so the panel now
// starts safely below it regardless of how many rows the HUD wraps to.
// `HUD_GAP` is the breathing room between them; `FALLBACK_HUD_BOTTOM`
// (matching this same file's own `saveError` banner's hardcoded `top-20`
// offset) covers the one frame before GraphEditor's ResizeObserver has
// measured, or any future caller that doesn't pass `hudBottom` at all.
const HUD_GAP = spacing[4];
const FALLBACK_HUD_BOTTOM = 80;

export function EmptyGraphCoach({
  visible,
  step,
  onDismiss,
  hudBottom,
}: {
  visible: boolean;
  step: CoachStep;
  onDismiss: () => void;
  hudBottom?: number;
}) {
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, onDismiss]);

  if (!visible) return null;

  const top = (hudBottom ?? FALLBACK_HUD_BOTTOM) + HUD_GAP;

  return (
    <div style={{ ...panelStyle, top }} role="region" aria-label="Authoring guide">
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
        }}
      >
        {`${step.stepLabel}. ${step.lines[0] ?? ""}`}
      </div>
      <div style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[1] }}>{step.title}</div>
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[2] }}>{step.stepLabel}</div>
      <ul
        style={{ ...typeScale.caption, lineHeight: "20px", margin: 0, paddingLeft: spacing[4], opacity: 0.9 }}
      >
        {step.lines.map((line) => (
          <li key={line.slice(0, 48)} style={{ marginBottom: spacing[1] }}>
            {line}
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        onClick={onDismiss}
        style={{ marginTop: spacing[3], minHeight: shell.touchTarget.min, pointerEvents: "auto" }}
      >
        Got it
      </Button>
    </div>
  );
}

const panelStyle: CSSProperties = {
  position: "absolute",
  // `top` is computed per-render above (kept out of this static object
  // since it depends on the measured HUD position), not a fixed spacing token.
  left: spacing[3],
  right: spacing[3],
  maxWidth: 420,
  zIndex: 15,
  padding: spacing[3],
  borderRadius: radius.lg,
  border: `1px solid ${color.primary[700]}`,
  background: color.neutral[900],
  color: text.primary,
  boxShadow: shadow[2],
  pointerEvents: "none",
};
