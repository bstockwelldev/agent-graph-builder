import type { CSSProperties } from "react";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";
import { color, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { SkeletonBlock } from "./ui/Skeleton";

// Minimal in-canvas graph switcher (studio-consolidation Phase 7) — lets a
// user jump to a different graph without leaving /graphs/[id]. Deliberately
// list-only: create/export/import already have a home on the /graphs list
// page, so this isn't a full port of apps/playground's GraphLibrary.tsx.
export function GraphLibrary({
  graphs,
  activeGraphId,
  loading = false,
  onSelect,
}: {
  graphs: GraphDefinition[];
  activeGraphId: string | null;
  loading?: boolean;
  onSelect: (graphId: string) => void;
}) {
  return (
    <div style={panelStyle}>
      <div style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[2] }}>Switch graph</div>
      {loading ? (
        <SkeletonBlock lines={3} gap={spacing[2]} />
      ) : graphs.length === 0 ? (
        <div role="status" style={{ ...typeScale.caption, opacity: 0.6, lineHeight: "18px" }}>
          No saved graphs yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
          {graphs.map((graph) => {
            const active = graph.id === activeGraphId;
            return (
              <button
                key={graph.id}
                type="button"
                onClick={() => onSelect(graph.id)}
                aria-current={active ? "true" : undefined}
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
      )}
    </div>
  );
}

const panelStyle: CSSProperties = {
  padding: spacing[3],
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
