import type { CSSProperties } from "react";
import type { NodeType } from "../types";

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
          <div style={{ fontSize: 11, opacity: 0.6 }}>{n.hint}</div>
        </button>
      ))}
    </div>
  );
}

const panelStyle: CSSProperties = {
  width: 200,
  padding: 12,
  borderRight: "1px solid #2a2d35",
  background: "#181a20",
  color: "#e8eaed",
  overflowY: "auto",
};

const headingStyle: CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  opacity: 0.6,
  marginBottom: 10,
};

const buttonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  marginBottom: 6,
  borderRadius: 6,
  border: "1px solid #2f333d",
  background: "#20232b",
  color: "#e8eaed",
  cursor: "pointer",
};
