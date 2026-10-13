"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Combobox, type ComboboxOption } from "@/components/graph/ui/Combobox";
import type { GraphScope } from "@/hooks/use-graph-scope";
import { localType, spacing, text } from "@/lib/graph-theme";

const WORKSPACE = "__workspace__";

/**
 * The panel Scope picker: Workspace, or one graph (use-graph-scope.ts). Built
 * from the graph kit's Combobox (canvas-styling-plan.md, PR 2), so a panel's
 * scope control looks like every other control on the canvas.
 */
export function ScopeSelect({ scope }: { scope: GraphScope }) {
  const { graphId, graphs, ready, setGraphId } = scope;
  const options: ComboboxOption[] = [
    { value: WORKSPACE, label: "Workspace" },
    ...graphs.map((graph) => ({ value: graph.id, label: graph.name, description: graph.id })),
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: spacing[2], minWidth: 0 }}>
      <div style={{ flex: "1 1 auto", minWidth: 0, maxWidth: 240 }}>
        <Combobox
          aria-label="Scope"
          value={graphId ?? WORKSPACE}
          options={options}
          disabled={!ready}
          searchPlaceholder="Find a graph…"
          onChange={(next) => setGraphId(!next || next === WORKSPACE ? null : next)}
        />
      </div>
      {graphId ? (
        <Link
          href={`/graphs/${encodeURIComponent(graphId)}`}
          className="agb-focus-ring"
          aria-label={`Open ${scope.graph?.name ?? graphId}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, color: text.secondary, textDecoration: "none", ...localType.ui }}
        >
          <ExternalLink size={14} aria-hidden="true" /> Open
        </Link>
      ) : null}
    </div>
  );
}
