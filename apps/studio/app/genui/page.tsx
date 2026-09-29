import { GenuiLibrary } from "@/components/studio/genui-library";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Surfaces render via a `human_gate` node's genuiCheckpointSurfaceJson config
// field. Previews here use the same renderer as the Run panel's checkpoint
// (components/graph/ui/GenuiSurface.tsx), read-only; the catalog
// (lib/genuiCatalog.ts) also feeds the inspector's "Insert example".

export default function GenUiPage() {
  return (
    <StudioPage>
      <StudioPageHeader
        title="GenUI component library"
        description="What a human_gate node's genuiCheckpointSurfaceJson can show while a run waits for approval: summaries, charts, tables, diffs, diagrams and inputs, bound to the run's data with $ref."
      />

      <GenuiLibrary />

      <Card>
        <CardHeader>
          <CardTitle>Using GenUI in a graph</CardTitle>
          <CardDescription>
            Set a <code className="text-foreground">human_gate</code> node&apos;s{" "}
            <code className="text-foreground">genuiCheckpointSurfaceJson</code> to{" "}
            <code className="text-foreground">{"{ \"root\": <GenuiNode> }"}</code>. When a run pauses there, the Run panel shows it with Approve / Reject.
            A data prop can be <code className="text-foreground">{"{ \"$ref\": \"/nodes/<node id>/output\" }"}</code> (or{" "}
            <code className="text-foreground">/input/&lt;variable&gt;</code>), a JSON Pointer into the paused run; a string output that is JSON is
            read through. Input values reach the next nodes as <code className="text-foreground">{"{<gate id>[<input id>]}"}</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </StudioPage>
  );
}
