import { FileCode2, X } from "lucide-react";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";
import { exportGraphJson, parseGraphRawConfig } from "@/lib/graphJsonPortability";
import { color, radius } from "@/lib/graph-theme";
import { IconButton } from "./ui/IconButton";
import { PanelFrame, PanelHeader } from "./ui/PanelFrame";
import { RawConfigEditor } from "./ui/RawConfigEditor";

/**
 * Graph-level raw config (studio-config-editor-and-console-plan.md §6,
 * graph scope): the whole GraphDefinition as JSON or YAML, next to
 * Import/Export. Apply replaces the canvas like Import does (undoable, not
 * saved until Save), with the same full schema validation.
 */
export function GraphConfigPanel({
  graph,
  onApply,
  onClose,
}: {
  graph: GraphDefinition;
  onApply: (graph: GraphDefinition) => void;
  onClose: () => void;
}) {
  return (
    <PanelFrame
      aria-label="Graph config"
      header={
        <PanelHeader
          icon={
            <span
              aria-hidden="true"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: radius.lg, background: `${color.primary[500]}1f`, color: color.primary[500], flexShrink: 0 }}
            >
              <FileCode2 size={16} />
            </span>
          }
          title="Graph config"
          subtitle="Nodes, edges, groups and layers. Apply updates the canvas; Save persists it."
          actions={<IconButton label="Close graph config" icon={<X size={16} />} onClick={onClose} />}
        />
      }
    >
      <RawConfigEditor
        label="Graph config"
        value={graph}
        format={exportGraphJson}
        parse={(json) => parseGraphRawConfig(json, graph.id)}
        onApply={onApply}
        height={520}
      />
    </PanelFrame>
  );
}
