"use client";

import { GenuiLibrary } from "@/components/studio/genui-library";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The GenUI catalog as a global workbench panel (canvas-first landing plan,
 * Phases 2-3): the library of surfaces plus the "how to use it in a graph"
 * note the retired /genui page carried. Previews use the Run panel
 * checkpoint's renderer, read-only; lib/genuiCatalog.ts also feeds the
 * inspector's "Insert example".
 */
export function GenuiPanel() {
  return (
    <div className="space-y-4 p-3">
      <p className="text-muted-foreground text-xs">
        What a <code>human_gate</code> node&apos;s <code>genuiCheckpointSurfaceJson</code> can show while a run waits for approval: summaries,
        charts, tables, diffs, diagrams and inputs, bound to the run&apos;s data with <code>$ref</code>.
      </p>
      <GenuiLibrary />
      <Card>
        <CardHeader>
          <CardTitle>Using GenUI in a graph</CardTitle>
          <CardDescription>
            Set a <code className="text-foreground">human_gate</code> node&apos;s{" "}
            <code className="text-foreground">genuiCheckpointSurfaceJson</code> to{" "}
            <code className="text-foreground">{"{ \"root\": <GenuiNode> }"}</code>. When a run pauses there, the Run panel shows it with Approve /
            Reject. A data prop can be <code className="text-foreground">{"{ \"$ref\": \"/nodes/<node id>/output\" }"}</code> (or{" "}
            <code className="text-foreground">/input/&lt;variable&gt;</code>), a JSON Pointer into the paused run; a string output that is JSON is
            read through. Input values reach the next nodes as <code className="text-foreground">{"{<gate id>[<input id>]}"}</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
