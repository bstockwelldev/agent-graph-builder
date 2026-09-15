import { useEffect, type CSSProperties } from "react";
import { color, radius, shadow, shell, spacing, text, typeScale } from "@/lib/graph-theme";
import type { CoachStep } from "@/lib/graphAuthoring";
import { Button } from "./ui/Button";

export function EmptyGraphCoach({
  visible,
  step,
  onDismiss,
}: {
  visible: boolean;
  step: CoachStep;
  onDismiss: () => void;
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

  return (
    <div style={panelStyle} role="region" aria-label="Authoring guide">
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
  top: spacing[3],
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
