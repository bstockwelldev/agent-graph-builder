import type { CSSProperties } from "react";
import type { NodeType } from "../types";
import { localType, spacing, surface, text, typeScale } from "../theme";
import { Button } from "./ui/Button";

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
        <Button key={n.type} variant="secondary" onClick={() => onAdd(n.type)} title={n.hint} style={itemStyle}>
          <div style={{ fontWeight: 600 }}>{n.label}</div>
          <div style={{ ...typeScale.caption, opacity: 0.6 }}>{n.hint}</div>
        </Button>
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

const itemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  marginBottom: spacing[2],
};
