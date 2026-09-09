import type { ChangeEvent, CSSProperties } from "react";
import { useRef, useState } from "react";
import type { GraphDefinition } from "../types";
import { color, radius, shell, spacing, surface, text, typeScale } from "../theme";
import { Button } from "./ui/Button";
import { SectionHeader } from "./ui/SectionHeader";
import { Select, TextInput } from "./ui/fields";

export function GraphLibrary({
  graphs,
  activeGraphId,
  onSelect,
  onCreate,
  onExport,
  onImport,
}: {
  graphs: GraphDefinition[];
  activeGraphId: string | null;
  onSelect: (graphId: string) => void;
  onCreate: (name: string, template: "blank" | "demo") => Promise<void>;
  onExport?: () => void;
  onImport?: (file: File) => Promise<void>;
}) {
  const [name, setName] = useState("Untitled graph");
  const [template, setTemplate] = useState<"blank" | "demo">("blank");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

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

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onImport) return;
    setImporting(true);
    try {
      await onImport(file);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={panelStyle}>
      <SectionHeader>Graph Library</SectionHeader>

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

      {(onExport || onImport) && (
        <div style={{ display: "flex", gap: spacing[2], marginBottom: spacing[3] }}>
          {onExport && (
            <Button variant="secondary" disabled={!activeGraphId} onClick={onExport} style={{ flex: 1 }}>
              Export JSON
            </Button>
          )}
          {onImport && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(event) => void handleImportChange(event)}
              />
              <Button
                variant="secondary"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
                style={{ flex: 1 }}
              >
                {importing ? "Importing…" : "Import JSON"}
              </Button>
            </>
          )}
        </div>
      )}

      <SectionHeader>New graph</SectionHeader>
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
  padding: shell.panelPadding,
  borderBottom: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
};

const graphButtonStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  color: text.primary,
  cursor: "pointer",
  textAlign: "left",
};
