import type { CSSProperties } from "react";
import { color, radius, shadow, shell, spacing, surface, text, typeScale } from "../theme";
import { Button } from "./ui/Button";

export function EmptyGraphCoach({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  if (!visible) return null;

  return (
    <div style={panelStyle} role="region" aria-label="Getting started">
      <div style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[2] }}>Start from the blank template</div>
      <ol style={{ ...typeScale.caption, lineHeight: "20px", margin: 0, paddingLeft: spacing[4], opacity: 0.9 }}>
        <li>Add a <b>Prompt</b> node between Input and Output.</li>
        <li>Add an <b>LLM</b> node after the prompt to call a model.</li>
        <li>Add a <b>Router</b> when you need branches — connect with conditional and default edge kinds.</li>
        <li>Use <b>Save</b> in the header when you want to persist without compiling.</li>
      </ol>
      <Button variant="secondary" onClick={onDismiss} style={{ marginTop: spacing[3], minHeight: shell.touchTarget.min }}>
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
  pointerEvents: "auto",
};
