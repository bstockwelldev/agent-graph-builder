import type { CSSProperties } from "react";
import { NODE_TYPE_TAXONOMY } from "../content/taxonomy";
import type { NodeType } from "../types";
import { nodeType, radius, shell, spacing, surface, text, typeScale } from "../theme";
import { TaxonomyTooltip } from "./Tooltip";
import { Button } from "./ui/Button";
import { SectionHeader } from "./ui/SectionHeader";

const NODE_TYPES: NodeType[] = ["input", "prompt", "llm", "tool", "router", "output"];

export function NodePalette({
  onAdd,
  authoringEnabled = true,
}: {
  onAdd: (type: NodeType) => void;
  authoringEnabled?: boolean;
}) {
  return (
    <div style={panelStyle}>
      <SectionHeader>Node Palette</SectionHeader>
      {!authoringEnabled && (
        <div style={{ ...typeScale.caption, opacity: 0.75, marginBottom: spacing[3], lineHeight: "18px" }}>
          Graph authoring is disabled on small screens. Use a wider viewport or desktop to add nodes and connections.
          You can still inspect nodes and run workflows.
        </div>
      )}
      {NODE_TYPES.map((type) => {
        const taxonomy = NODE_TYPE_TAXONOMY[type];
        return (
          <div key={type} style={{ marginBottom: spacing[2] }}>
            <TaxonomyTooltip layout="corner" title={taxonomy.title} summary={taxonomy.summary} details={taxonomy.details}>
              <Button
                variant="secondary"
                disabled={!authoringEnabled}
                onClick={() => onAdd(type)}
                title={taxonomy.summary}
                aria-describedby={undefined}
                style={{
                  ...itemStyle,
                  borderLeft: `3px solid ${nodeType[type].accent}`,
                }}
              >
                <div style={{ fontWeight: 600, paddingRight: shell.touchTarget.min, color: nodeType[type].label }}>
                  {taxonomy.title.replace(" node", "")}
                </div>
                <div style={{ ...typeScale.caption, opacity: 0.6, paddingRight: shell.touchTarget.min }}>{taxonomy.summary}</div>
              </Button>
            </TaxonomyTooltip>
          </div>
        );
      })}
    </div>
  );
}

const panelStyle: CSSProperties = {
  width: "100%",
  padding: shell.panelPadding,
  background: surface.panel,
  color: text.primary,
};

const itemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  minHeight: 44,
  position: "relative",
  borderRadius: radius.lg,
};
