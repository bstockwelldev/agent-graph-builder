import type { CSSProperties, ReactNode } from "react";
import type { GraphEdge, GraphNode } from "../types";
import { fontFamily, localType, spacing, surface, text, typeScale } from "../theme";
import { Button } from "./ui/Button";
import { Select, TextArea, TextInput } from "./ui/fields";

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
          <TextInput
            value={(node.config.variableName as string) ?? ""}
            onChange={(e) => set("variableName", e.target.value)}
          />
        </Field>
      )}

      {node.type === "prompt" && (
        <Field label="Template (use {question}, {upstream}, and any run variable)">
          <TextArea
            style={{ height: 120, fontFamily: fontFamily.mono }}
            value={(node.config.template as string) ?? ""}
            onChange={(e) => set("template", e.target.value)}
          />
        </Field>
      )}

      {node.type === "llm" && (
        <>
          <Field label="Model">
            <TextInput
              value={(node.config.model as string) ?? "qwen2.5:3b"}
              onChange={(e) => set("model", e.target.value)}
            />
          </Field>
          <Field label="System prompt">
            <TextArea
              style={{ height: 80 }}
              value={(node.config.systemPrompt as string) ?? ""}
              onChange={(e) => set("systemPrompt", e.target.value)}
            />
          </Field>
        </>
      )}

      {node.type === "tool" && (
        <>
          <Field label="Tool">
            <Select
              value={(node.config.toolName as string) ?? "lookup_topic"}
              onChange={(e) => set("toolName", e.target.value)}
            >
              <option value="lookup_topic">lookup_topic</option>
            </Select>
          </Field>
          <Field label="Input variable">
            <TextInput
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

      <Button variant="destructive" style={{ marginTop: spacing[2] }} onClick={onDelete}>
        Delete node
      </Button>
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
        <Select value={edge.kind} onChange={(e) => onChange({ kind: e.target.value as GraphEdge["kind"] })}>
          <option value="sequence">sequence</option>
          <option value="conditional">conditional</option>
          <option value="default">default</option>
        </Select>
      </Field>

      {edge.kind === "conditional" && (
        <Field label="Condition (substring match against upstream router input)">
          <TextInput value={edge.condition ?? ""} onChange={(e) => onChange({ condition: e.target.value })} />
        </Field>
      )}

      <Button variant="destructive" style={{ marginTop: spacing[2] }} onClick={onDelete}>
        Delete edge
      </Button>
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
