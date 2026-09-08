import type { CSSProperties, ReactNode } from "react";
import type { GraphEdge, GraphNode } from "../types";
import { accentSurface, fontFamily, localType, radius, spacing, surface, text, typeScale } from "../theme";

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
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[3] - 2 }}>{node.id}</div>

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
            style={{ ...inputStyle, height: 120, fontFamily: fontFamily.mono }}
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
        <div style={{ ...typeScale.caption, opacity: 0.75, lineHeight: "18px" }}>
          Routing is driven entirely by this node's outgoing edges: mark an
          edge <b>conditional</b> with a condition string matched against the
          upstream LLM's output, and exactly one edge <b>default</b> as the
          fallback. Select an edge on the canvas to configure it.
        </div>
      )}

      {node.type === "output" && (
        <div style={{ ...typeScale.caption, opacity: 0.75 }}>
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
      <div style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[3] - 2 }}>
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
    <div style={{ marginBottom: spacing[3] }}>
      <label style={{ display: "block", ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>{label}</label>
      {children}
    </div>
  );
}

const panelStyle: CSSProperties = {
  width: 300,
  padding: spacing[3],
  borderLeft: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  overflowY: "auto",
};

const headingStyle: CSSProperties = {
  ...localType.label,
  opacity: 0.6,
  marginBottom: spacing[1],
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: `${spacing[2]}px`,
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  ...localType.ui,
};

const deleteButtonStyle: CSSProperties = {
  marginTop: spacing[2],
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderRadius: radius.lg,
  border: `1px solid ${accentSurface.destructive.border}`,
  background: accentSurface.destructive.bg,
  color: accentSurface.destructive.text,
  cursor: "pointer",
  ...typeScale.caption,
};
