"use client";

import { Card } from "@/components/graph/ui/Card";
import { GenuiLibrary } from "@/components/studio/genui-library";
import { spacing, text, typeScale } from "@/lib/graph-theme";

/**
 * The GenUI catalog as a global workbench panel (canvas-first landing plan,
 * Phases 2-3): the library of surfaces plus the "how to use it in a graph"
 * note the retired /genui page carried. Previews use the Run panel
 * checkpoint's renderer, read-only; lib/genuiCatalog.ts also feeds the
 * inspector's "Insert example". Styled from the canvas tokens
 * (canvas-styling-plan.md, PR 2).
 */
const code = { color: text.primary };

export function GenuiPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[3], padding: spacing[3], color: text.primary }}>
      <p style={{ margin: 0, ...typeScale.caption, color: text.secondary }}>
        What a <code style={code}>human_gate</code> node&apos;s <code style={code}>genuiCheckpointSurfaceJson</code> can show while a run waits for
        approval: summaries, charts, tables, diffs, diagrams and inputs, bound to the run&apos;s data with <code style={code}>$ref</code>.
      </p>
      <GenuiLibrary />
      <Card title="Using GenUI in a graph">
        <p style={{ margin: 0, ...typeScale.caption, color: text.secondary }}>
          Set a <code style={code}>human_gate</code> node&apos;s <code style={code}>genuiCheckpointSurfaceJson</code> to{" "}
          <code style={code}>{"{ \"root\": <GenuiNode> }"}</code>. When a run pauses there, the Run panel shows it with Approve / Reject. A data prop
          can be <code style={code}>{"{ \"$ref\": \"/nodes/<node id>/output\" }"}</code> (or <code style={code}>/input/&lt;variable&gt;</code>), a JSON
          Pointer into the paused run; a string output that is JSON is read through. Input values reach the next nodes as{" "}
          <code style={code}>{"{<gate id>[<input id>]}"}</code>.
        </p>
      </Card>
    </div>
  );
}
