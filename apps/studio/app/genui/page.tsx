import type { GenuiNode } from "@/lib/genui";
import { GenuiSurfaceView } from "@/components/genui/genui-renderer";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Ported from micro-ui-agent-builder's /genui docs page, adapted for AGB:
// surfaces render via a `human_gate` node's genuiCheckpointSurfaceJson
// config field (validated by node_configs.py) rather than an "Output flow
// step" + `@repo/shared`. Action dispatch stays inert, same as MUI's.

const SAMPLE_DASHBOARD: GenuiNode = {
  type: "Stack",
  props: { direction: "col", gap: 20 },
  children: [
    {
      type: "Text",
      props: { content: "Structured surfaces a human_gate checkpoint can present while a run is paused." },
    },
    {
      type: "Card",
      props: { title: "Status" },
      children: [
        {
          type: "Stack",
          props: { direction: "row", gap: 8 },
          children: [
            { type: "Button", id: "refresh", props: { label: "Refresh", actionId: "reload_metrics" } },
            { type: "Button", id: "export", props: { label: "Export" } },
          ],
        },
      ],
    },
  ],
};

const SAMPLE_FORM: GenuiNode = {
  type: "Stack",
  props: { direction: "col", gap: 16 },
  children: [
    { type: "Text", props: { content: "Quick capture" } },
    { type: "FormField", id: "title", props: { label: "Title", inputType: "text" } },
    { type: "FormField", id: "amount", props: { label: "Amount", inputType: "number" } },
    { type: "Button", id: "save", props: { label: "Save draft", actionId: "save_draft" } },
  ],
};

const TYPE_REFERENCE: { name: string; summary: string; fields: string[] }[] = [
  {
    name: "Stack",
    summary: "Layout container; composes children vertically or horizontally.",
    fields: ["props.gap?", "props.direction? col | row", "children[]"],
  },
  {
    name: "Text",
    summary: "Static copy block for labels, descriptions, or lightweight prose.",
    fields: ["props.content"],
  },
  {
    name: "Button",
    summary: "Primary affordance; actionId maps to a client handler name (dispatch is currently inert).",
    fields: ["id", "props.label", "props.actionId?"],
  },
  {
    name: "Card",
    summary: "Grouped panel with an optional title and nested GenUI children.",
    fields: ["props.title?", "children?[]"],
  },
  {
    name: "FormField",
    summary: "Label + input shell for structured data collection UIs.",
    fields: ["id", "props.label", "props.inputType? text | number"],
  },
];

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="border-border bg-muted/40 text-foreground/90 max-h-56 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function GenUiPage() {
  return (
    <StudioPage>
      <StudioPageHeader
        title="GenUI component library"
        description="Surface node types a human_gate node's genuiCheckpointSurfaceJson config can render while a run is paused for approval."
      />

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Example · dashboard strip</CardTitle>
            <CardDescription>Card + horizontal Stack of Buttons — common pattern for toolbars.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GenuiSurfaceView surface={{ root: SAMPLE_DASHBOARD }} />
            <JsonBlock value={{ root: SAMPLE_DASHBOARD }} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Example · form column</CardTitle>
            <CardDescription>Text, FormField nodes, and a closing action.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GenuiSurfaceView surface={{ root: SAMPLE_FORM }} />
            <JsonBlock value={{ root: SAMPLE_FORM }} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Type reference</CardTitle>
          <CardDescription>
            Matches <code className="text-foreground">GenuiNode</code> in{" "}
            <code className="text-foreground">apps/studio/lib/genui.ts</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {TYPE_REFERENCE.map((row) => (
              <li key={row.name} className="border-border border-b pb-4 last:border-0 last:pb-0">
                <p className="text-foreground font-mono text-sm font-semibold">{row.name}</p>
                <p className="text-muted-foreground mt-1 text-sm">{row.summary}</p>
                <ul className="text-muted-foreground mt-2 list-inside list-disc font-mono text-[11px]">
                  {row.fields.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Using GenUI in a graph</CardTitle>
          <CardDescription>
            Set a <code className="text-foreground">human_gate</code> node&apos;s{" "}
            <code className="text-foreground">genuiCheckpointSurfaceJson</code> config field to{" "}
            <code className="text-foreground">{"{ \"root\": <GenuiNode> }"}</code> — it renders here and in the node
            inspector once the run reaches that checkpoint. Action dispatch stays inert for now, matching MUI&apos;s
            original behavior.
          </CardDescription>
        </CardHeader>
      </Card>
    </StudioPage>
  );
}
