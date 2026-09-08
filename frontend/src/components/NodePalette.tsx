import type { CSSProperties } from "react";
import type { NodeType } from "../types";
import { localType, radius, spacing, surface, text, typeScale } from "../theme";

const NODE_TYPES: { type: NodeType; label: string; hint: string }[] = [
  { type: "input", label: "Input", hint: "Accept user input" },
  { type: "prompt", label: "Prompt", hint: "Render a prompt from graph state" },
  { type: "llm", label: "LLM", hint: "Call a model" },
  { type: "tool", label: "Tool", hint: "Deterministic operation" },
  { type: "router", label: "Router", hint: "Choose one outgoing edge" },
  { type: "output", label: "Output", hint: "Return final result" },
];

export function NodePalette({ onAdd }: { onAdd: (type: NodeType) => void }) {
  return (
    <div style={panelStyle}>
      <div style={headingStyle}>Node Palette</div>
      {NODE_TYPES.map((n) => (
        <button key={n.type} onClick={() => onAdd(n.type)} style={buttonStyle} title={n.hint}>
          <div style={{ fontWeight: 600 }}>{n.label}</div>
          <div style={{ ...typeScale.caption, opacity: 0.6 }}>{n.hint}</div>
        </button>
      ))}
    </div>
  );
}

const panelStyle: CSSProperties = {
  width: 200,
  padding: spacing[3],
  borderRight: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  overflowY: "auto",
};

const headingStyle: CSSProperties = {
  ...localType.label,
  opacity: 0.6,
  marginBottom: spacing[3],
};

const buttonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: `${spacing[2]}px ${spacing[3]}px`,
  marginBottom: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  cursor: "pointer",
};
