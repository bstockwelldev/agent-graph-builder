import type { CSSProperties, ReactNode } from "react";
import type { GraphEdge, GraphNode } from "../types";

export function NodeInspector({
  node,
  onConfigChange,
  onDelete,
}: {
  node: GraphNode;
  onConfigChange: (config: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const set = (key: string, value: unknown) => onConfigChange({ ...node.config, [key]: value });

  return (
    <div style={panelStyle}>
      <div style={headingStyle}>Configure: {node.type}</div>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>{node.id}</div>

      {node.type === "input" && (
        <Field label="Variable name">
          <input
            style={inputStyle}
            value={(node.config.variableName as string) ?? ""}
            onChange={(e) => set("variableName", e.target.value)}
          />
        </Field>
      )}

      {node.type === "prompt" && (
        <Field label="Template (use {question}, {upstream}, and any run variable)">
          <textarea
            style={{ ...inputStyle, height: 120, fontFamily: "monospace" }}
            value={(node.config.template as string) ?? ""}
            onChange={(e) => set("template", e.target.value)}
          />
        </Field>
      )}

      {node.type === "llm" && (
        <>
          <Field label="Model">
            <input
              style={inputStyle}
              value={(node.config.model as string) ?? "qwen2.5:3b"}
              onChange={(e) => set("model", e.target.value)}
            />
          </Field>
          <Field label="System prompt">
            <textarea
              style={{ ...inputStyle, height: 80 }}
              value={(node.config.systemPrompt as string) ?? ""}
              onChange={(e) => set("systemPrompt", e.target.value)}
            />
          </Field>
        </>
      )}

      {node.type === "tool" && (
        <>
          <Field label="Tool">
            <select
              style={inputStyle}
              value={(node.config.toolName as string) ?? "lookup_topic"}
              onChange={(e) => set("toolName", e.target.value)}
            >
              <option value="lookup_topic">lookup_topic</option>
            </select>
          </Field>
          <Field label="Input variable">
            <input
              style={inputStyle}
              value={(node.config.inputVariable as string) ?? "question"}
              onChange={(e) => set("inputVariable", e.target.value)}
            />
          </Field>
        </>
      )}

      {node.type === "router" && (
        <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
          Routing is driven entirely by this node's outgoing edges: mark an
          edge <b>conditional</b> with a condition string matched against the
          upstream LLM's output, and exactly one edge <b>default</b> as the
          fallback. Select an edge on the canvas to configure it.
        </div>
      )}

      {node.type === "output" && (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          No configuration -- returns whatever reaches it as the run result.
        </div>
      )}

      <button style={deleteButtonStyle} onClick={onDelete}>
        Delete node
      </button>
    </div>
  );
}

export function EdgeInspector({
  edge,
  onChange,
  onDelete,
}: {
  edge: GraphEdge;
  onChange: (patch: Partial<GraphEdge>) => void;
  onDelete: () => void;
}) {
  return (
    <div style={panelStyle}>
      <div style={headingStyle}>Configure edge</div>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
        {edge.source} → {edge.target}
      </div>

      <Field label="Kind">
        <select
          style={inputStyle}
          value={edge.kind}
          onChange={(e) => onChange({ kind: e.target.value as GraphEdge["kind"] })}
        >
          <option value="sequence">sequence</option>
          <option value="conditional">conditional</option>
          <option value="default">default</option>
        </select>
      </Field>

      {edge.kind === "conditional" && (
        <Field label="Condition (substring match against upstream router input)">
          <input
            style={inputStyle}
            value={edge.condition ?? ""}
            onChange={(e) => onChange({ condition: e.target.value })}
          />
        </Field>
      )}

      <button style={deleteButtonStyle} onClick={onDelete}>
        Delete edge
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const panelStyle: CSSProperties = {
  width: 300,
  padding: 12,
  borderLeft: "1px solid #2a2d35",
  background: "#181a20",
  color: "#e8eaed",
  overflowY: "auto",
};

const headingStyle: CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  opacity: 0.6,
  marginBottom: 4,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #2f333d",
  background: "#20232b",
  color: "#e8eaed",
  fontSize: 13,
};

const deleteButtonStyle: CSSProperties = {
  marginTop: 8,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #5a2c2c",
  background: "#2b1c1c",
  color: "#f0a0a0",
  cursor: "pointer",
  fontSize: 12,
};
