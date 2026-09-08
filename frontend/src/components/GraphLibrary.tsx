import type { CSSProperties } from "react";
import { useState } from "react";
import type { GraphDefinition } from "../types";
import { color, localType, spacing, surface, text, typeScale } from "../theme";
import { Button } from "./ui/Button";
import { Select, TextInput } from "./ui/fields";

export function GraphLibrary({
  graphs,
  activeGraphId,
  onSelect,
  onCreate,
}: {
  graphs: GraphDefinition[];
  activeGraphId: string | null;
  onSelect: (graphId: string) => void;
  onCreate: (name: string, template: "blank" | "demo") => Promise<void>;
}) {
  const [name, setName] = useState("Untitled graph");
  const [template, setTemplate] = useState<"blank" | "demo">("blank");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreate(name.trim() || "Untitled graph", template);
      setName("Untitled graph");
      setTemplate("blank");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={panelStyle}>
      <div style={headingStyle}>Graph Library</div>

      <div style={{ display: "flex", flexDirection: "column", gap: spacing[2], marginBottom: spacing[3] }}>
        {graphs.length === 0 && (
          <div style={{ ...typeScale.caption, opacity: 0.6 }}>No saved graphs yet.</div>
        )}
        {graphs.map((graph) => {
          const active = graph.id === activeGraphId;
          return (
            <button
              key={graph.id}
              type="button"
              onClick={() => onSelect(graph.id)}
              style={{
                ...graphButtonStyle,
                borderColor: active ? color.primary[600] : surface.borderStrong,
                background: active ? color.neutral[800] : surface.raised,
              }}
            >
              <div style={{ fontWeight: 600, textAlign: "left" }}>{graph.name}</div>
              <div style={{ ...typeScale.caption, opacity: 0.6, textAlign: "left" }}>{graph.id}</div>
            </button>
          );
        })}
      </div>

      <div style={headingStyle}>New graph</div>
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Graph name"
        aria-label="New graph name"
      />
      <Select
        value={template}
        onChange={(e) => setTemplate(e.target.value as "blank" | "demo")}
        style={{ marginTop: spacing[2] }}
        aria-label="Graph template"
      >
        <option value="blank">Blank (input → output)</option>
        <option value="demo">From demo (classify &amp; route)</option>
      </Select>
      <Button variant="secondary" disabled={creating} onClick={() => void handleCreate()} style={{ marginTop: spacing[2], width: "100%" }}>
        {creating ? "Creating…" : "Create graph"}
      </Button>
    </div>
  );
}

const panelStyle: CSSProperties = {
  padding: spacing[3],
  borderBottom: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
};

const headingStyle: CSSProperties = {
  ...localType.label,
  opacity: 0.6,
  marginBottom: spacing[2],
};

const graphButtonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: spacing[2],
  borderRadius: 8,
  border: `1px solid ${surface.borderStrong}`,
  color: text.primary,
  cursor: "pointer",
  textAlign: "left",
};
