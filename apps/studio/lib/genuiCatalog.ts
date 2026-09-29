import type { GenuiData, GenuiNode } from "./genui";

/**
 * The GenUI component catalog (resource-forms-consistency-plan.md slice 5,
 * part 2): one entry per component, with its props and a working example.
 * The /genui library renders a card per entry, and the inspector's surface
 * editor offers the examples under "Insert example".
 */
export type GenuiProp = { name: string; type: string; required?: boolean; description: string };

export type GenuiCatalogEntry = {
  type: GenuiNode["type"];
  summary: string;
  props: GenuiProp[];
  example: GenuiNode;
};

const REF = "or a $ref";

/** What a paused run would hand to `$ref`s; the library previews use it. */
export const SAMPLE_DATA: GenuiData = {
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

export const GENUI_CATALOG: GenuiCatalogEntry[] = [
  {
    type: "Approval",
    summary: "Approve / Reject with an optional Markdown summary. The approver can also add a reason.",
    props: [
      { name: "title", type: "string", description: "Heading above the summary." },
      { name: "summary", type: `string (Markdown) ${REF}`, description: "What is being approved." },
      { name: "approveLabel", type: "string", description: 'Approve button text (default "Approve").' },
      { name: "rejectLabel", type: "string", description: 'Reject button text (default "Reject").' },
    ],
    example: {
      type: "Approval",
      props: { title: "Ship the pricing change?", summary: { $ref: "/nodes/llm_answer/output" }, approveLabel: "Ship to 10%", rejectLabel: "Hold" },
    },
  },
  {
    type: "Chart",
    summary: "Bar, line or area chart over rows: one x key, up to 8 numeric y keys, one axis. Has a legend, hover values and a table view.",
    props: [
      { name: "data", type: `rows ${REF}`, required: true, description: "A list of objects (or JSON text of one)." },
      { name: "x", type: "string", required: true, description: "Key for the x axis." },
      { name: "y", type: "string | string[]", required: true, description: "Numeric key(s), one series each." },
      { name: "kind", type: '"bar" | "line" | "area"', description: 'Default "bar".' },
      { name: "title", type: "string", description: "Caption; also names the chart for screen readers." },
      { name: "height", type: "number (120–480)", description: "Plot height in px (default 200)." },
    ],
    example: { type: "Chart", props: { kind: "line", title: "Weekly revenue and churn", data: { $ref: "/nodes/tool_metrics/output" }, x: "week", y: ["revenue", "churn"] } },
  },
  {
    type: "Table",
    summary: "Rows as a table. Numbers align right.",
    props: [
      { name: "rows", type: `rows ${REF}`, required: true, description: "A list of objects." },
      { name: "columns", type: "(string | {key, label})[]", description: "Which keys, in order (default: every key)." },
      { name: "caption", type: "string", description: "Title above the table." },
    ],
    example: { type: "Table", props: { rows: { $ref: "/nodes/tool_metrics/output" }, caption: "Metrics", columns: ["week", { key: "revenue", label: "Revenue ($k)" }] } },
  },
  {
    type: "KeyValue",
    summary: "Labelled facts.",
    props: [
      { name: "items", type: `object | {label, value}[] ${REF}`, required: true, description: "Values may be $refs too." },
      { name: "title", type: "string", description: "Heading." },
    ],
    example: { type: "KeyValue", props: { title: "Request", items: { question: { $ref: "/input/question" }, requested_by: "pricing-team", tier: "Starter" } } },
  },
  {
    type: "Diff",
    summary: "Line diff between two values, for approve-this-change views. Objects are compared as formatted JSON.",
    props: [
      { name: "before", type: `any ${REF}`, required: true, description: "The current value." },
      { name: "after", type: `any ${REF}`, required: true, description: "The proposed value." },
      { name: "title", type: "string", description: "Heading." },
    ],
    example: { type: "Diff", props: { title: "Price table", before: "Starter: $9\nPro: $29\nTeam: $79", after: "Starter: $12\nPro: $29\nTeam: $89" } },
  },
  {
    type: "Diagram",
    summary: "A Mermaid flowchart subset: graph TD/LR; [ ] ( ) { } (( )) nodes; --> --- -.-> ==> links; |labels|.",
    props: [
      { name: "source", type: `string ${REF}`, required: true, description: "The flowchart source." },
      { name: "title", type: "string", description: "Caption." },
    ],
    example: {
      type: "Diagram",
      props: { title: "Rollout", source: "graph LR\n  A[Draft] --> B{Approved?}\n  B -->|yes| C(Ship 10%)\n  B -->|no| D(Revise)\n  C --> E((Full rollout))" },
    },
  },
  {
    type: "Markdown",
    summary: "Headings, lists, **bold**, *italic*, `code`, links and code blocks. Never raw HTML; only http(s) and mailto links.",
    props: [{ name: "content", type: `string ${REF}`, required: true, description: "The Markdown." }],
    example: { type: "Markdown", props: { content: { $ref: "/nodes/llm_answer/output" } } },
  },
  {
    type: "Text",
    summary: "Plain text.",
    props: [{ name: "content", type: `string ${REF}`, required: true, description: "The text." }],
    example: { type: "Text", props: { content: "Confirm the lookup before answering." } },
  },
  {
    type: "FormField",
    summary: "A text or number answer. It reaches later nodes as {<gate id>[<id>]}.",
    props: [
      { name: "id", type: "string", required: true, description: "Answer key (node-level, not in props)." },
      { name: "label", type: "string", required: true, description: "Field label." },
      { name: "inputType", type: '"text" | "number"', description: 'Default "text".' },
      { name: "placeholder", type: "string", description: "Hint inside the field." },
    ],
    example: { type: "FormField", id: "budget", props: { label: "Budget", inputType: "number" } },
  },
  {
    type: "Select",
    summary: "One choice from a list; the answer is the option's value.",
    props: [
      { name: "id", type: "string", required: true, description: "Answer key (node-level)." },
      { name: "label", type: "string", required: true, description: "Field label." },
      { name: "options", type: "(string | {value, label})[]", required: true, description: "At least one." },
    ],
    example: { type: "Select", id: "cohort", props: { label: "Rollout cohort", options: ["10%", "25%", { value: "50%", label: "Half" }] } },
  },
  {
    type: "Checkbox",
    summary: "A yes/no answer (true or false).",
    props: [
      { name: "id", type: "string", required: true, description: "Answer key (node-level)." },
      { name: "label", type: "string", required: true, description: "Checkbox label." },
    ],
    example: { type: "Checkbox", id: "notify", props: { label: "Notify the pricing channel" } },
  },
  {
    type: "Button",
    summary: 'Dispatches its actionId: "approve", "reject", or any other id (approves, recorded as values.action).',
    props: [
      { name: "id", type: "string", required: true, description: "Node id (node-level)." },
      { name: "label", type: "string", required: true, description: "Button text." },
      { name: "actionId", type: "string", description: "What pressing it does; without one it's inert." },
    ],
    example: {
      type: "Stack",
      props: { direction: "row", gap: 8 },
      children: [
        { type: "Button", id: "escalate", props: { label: "Escalate", actionId: "escalate" } },
        { type: "Button", id: "decline", props: { label: "Decline", actionId: "reject" } },
      ],
    },
  },
  {
    type: "Card",
    summary: "A grouped panel with an optional title.",
    props: [
      { name: "title", type: "string", description: "Heading." },
      { name: "children", type: "GenuiNode[]", description: "Contents (node-level, not in props)." },
    ],
    example: { type: "Card", props: { title: "Status" }, children: [{ type: "Text", props: { content: "All checks passed." } }] },
  },
  {
    type: "Stack",
    summary: "Lays children out in a column or a wrapping row.",
    props: [
      { name: "direction", type: '"col" | "row"', description: 'Default "col".' },
      { name: "gap", type: "number (0–64)", description: "Space between children in px (default 8)." },
      { name: "children", type: "GenuiNode[]", required: true, description: "Contents (node-level, not in props)." },
    ],
    example: {
      type: "Stack",
      props: { direction: "row", gap: 12 },
      children: [
        { type: "Text", props: { content: "Left" } },
        { type: "Text", props: { content: "Right" } },
      ],
    },
  },
];

/** A full checkpoint: the pattern most gates want. */
export const GENUI_PATTERN: GenuiNode = {
  type: "Stack",
  props: { gap: 16 },
  children: [
    GENUI_CATALOG.find((entry) => entry.type === "Approval")!.example,
    GENUI_CATALOG.find((entry) => entry.type === "Chart")!.example,
    GENUI_CATALOG.find((entry) => entry.type === "Select")!.example,
    GENUI_CATALOG.find((entry) => entry.type === "Checkbox")!.example,
  ],
};

export function surfaceJson(root: GenuiNode): string {
  return JSON.stringify({ root }, null, 2);
}
