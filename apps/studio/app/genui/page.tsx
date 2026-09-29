import type { GenuiData, GenuiNode } from "@/lib/genui";
import { GenuiSurface } from "@/components/graph/ui/GenuiSurface";
import { StudioPage } from "@/components/studio/studio-page";
import { StudioPageHeader } from "@/components/studio/studio-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Surfaces render via a `human_gate` node's genuiCheckpointSurfaceJson config
// field. Previews here use the same renderer as the Run panel's checkpoint
// (components/graph/ui/GenuiSurface.tsx), read-only, with sample run data
// standing in for the paused run that `$ref`s point into.

/** What a paused run would provide to `$ref`s (lib/genui.ts GenuiData). */
const SAMPLE_DATA: GenuiData = {
  input: { question: "Should we ship the Q3 pricing change?" },
  nodes: {
    llm_answer: {
      status: "succeeded",
      input: null,
      output: "**Recommendation:** ship to 10% first.\n\n- Revenue impact looks positive\n- Churn risk is concentrated in the *Starter* tier",
    },
    tool_metrics: {
      status: "succeeded",
      input: null,
      output: [
        { week: "W1", revenue: 120, churn: 14 },
        { week: "W2", revenue: 134, churn: 12 },
        { week: "W3", revenue: 129, churn: 15 },
        { week: "W4", revenue: 151, churn: 11 },
      ],
    },
  },
};

const EXAMPLES: { title: string; description: string; root: GenuiNode }[] = [
  {
    title: "Approval with a summary from the run",
    description: "Approval renders Approve / Reject; its summary is Markdown pulled from an llm node's output with $ref.",
    root: {
      type: "Approval",
      props: { title: "Ship the pricing change?", summary: { $ref: "/nodes/llm_answer/output" }, approveLabel: "Ship to 10%", rejectLabel: "Hold" },
    },
  },
  {
    title: "Chart and table over tool output",
    description: "Chart (bar, line or area) and Table read rows from a node's output; the chart's Table button shows the same values.",
    root: {
      type: "Stack",
      props: { gap: 16 },
      children: [
        { type: "Chart", props: { kind: "line", title: "Weekly revenue and churn", data: { $ref: "/nodes/tool_metrics/output" }, x: "week", y: ["revenue", "churn"] } },
        { type: "Table", props: { rows: { $ref: "/nodes/tool_metrics/output" }, caption: "Metrics" } },
      ],
    },
  },
  {
    title: "What changes, and why",
    description: "KeyValue for facts, Diff for an approve-this-change view.",
    root: {
      type: "Stack",
      props: { gap: 16 },
      children: [
        { type: "KeyValue", props: { title: "Request", items: { question: { $ref: "/input/question" }, requested_by: "pricing-team", tier: "Starter" } } },
        { type: "Diff", props: { title: "Price table", before: "Starter: $9\nPro: $29\nTeam: $79", after: "Starter: $12\nPro: $29\nTeam: $89" } },
      ],
    },
  },
  {
    title: "Diagram and form inputs",
    description: "Diagram draws a Mermaid flowchart; FormField, Select and Checkbox values go back to the run on approve.",
    root: {
      type: "Stack",
      props: { gap: 16 },
      children: [
        { type: "Diagram", props: { title: "Rollout", source: "graph LR\n  A[Draft] --> B{Approved?}\n  B -->|yes| C(Ship 10%)\n  B -->|no| D(Revise)\n  C --> E((Full rollout))" } },
        { type: "Select", id: "cohort", props: { label: "Rollout cohort", options: ["10%", "25%", "50%"] } },
        { type: "FormField", id: "budget", props: { label: "Budget", inputType: "number" } },
        { type: "Checkbox", id: "notify", props: { label: "Notify the pricing channel" } },
      ],
    },
  },
];

const TYPE_REFERENCE: { name: string; summary: string; fields: string[] }[] = [
  { name: "Stack", summary: "Layout container; children vertically or horizontally.", fields: ["props.gap?", "props.direction? col | row", "children[]"] },
  { name: "Card", summary: "Grouped panel with an optional title.", fields: ["props.title?", "children?[]"] },
  { name: "Text", summary: "Plain text.", fields: ["props.content (or $ref)"] },
  { name: "Markdown", summary: "Headings, lists, **bold**, *italic*, `code`, links and code blocks. Never raw HTML.", fields: ["props.content (or $ref)"] },
  { name: "Approval", summary: "Approve / Reject with an optional Markdown summary.", fields: ["props.title?", "props.summary? (or $ref)", "props.approveLabel?", "props.rejectLabel?"] },
  { name: "Button", summary: "Dispatches its actionId: approve, reject, or any other id (approves, recorded as values.action).", fields: ["id", "props.label", "props.actionId?"] },
  { name: "FormField", summary: "Text or number input; its value reaches the run on approve.", fields: ["id", "props.label", "props.inputType? text | number", "props.placeholder?"] },
  { name: "Select", summary: "One choice from a list.", fields: ["id", "props.label", "props.options[] (string or {value, label})"] },
  { name: "Checkbox", summary: "A yes/no answer (true/false).", fields: ["id", "props.label"] },
  { name: "Chart", summary: "Bar, line or area over rows; up to 8 series, one axis.", fields: ["props.kind? bar | line | area", "props.data (rows or $ref)", "props.x", "props.y (key or keys)", "props.title?", "props.height?"] },
  { name: "Table", summary: "Rows as a table.", fields: ["props.rows (rows or $ref)", "props.columns?[]", "props.caption?"] },
  { name: "KeyValue", summary: "Labelled facts.", fields: ["props.items (object, [{label, value}] or $ref)", "props.title?"] },
  { name: "Diff", summary: "Line diff between two values.", fields: ["props.before", "props.after", "props.title?"] },
  { name: "Diagram", summary: "Mermaid flowchart subset (graph TD/LR, [ ] ( ) { } (( )) nodes, --> --- -.-> ==> links, |labels|).", fields: ["props.source (or $ref)", "props.title?"] },
];

function JsonBlock({ value, label }: { value: unknown; label: string }) {
  // Focusable so keyboard users can scroll it (max-h + overflow-auto).
  return (
    <pre tabIndex={0} role="region" aria-label={label} className="focus-visible:ring-primary/60 focus-visible:ring-2 focus-visible:outline-none border-border bg-muted/40 text-foreground/90 max-h-56 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function GenUiPage() {
  return (
    <StudioPage>
      <StudioPageHeader
        title="GenUI component library"
        description="What a human_gate node's genuiCheckpointSurfaceJson can show while a run waits for approval: summaries, charts, tables, diffs, diagrams and inputs, bound to the run's data with $ref."
      />

      <section className="grid gap-4 md:grid-cols-2">
        {EXAMPLES.map((example) => (
          <Card key={example.title}>
            <CardHeader>
              <CardTitle>{example.title}</CardTitle>
              <CardDescription>{example.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <GenuiSurface surface={{ root: example.root }} data={SAMPLE_DATA} />
              <JsonBlock label={`${example.title} JSON`} value={{ root: example.root }} />
            </CardContent>
          </Card>
        ))}
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
