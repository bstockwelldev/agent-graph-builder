import { z } from "zod";
import type { NodeTrace } from "@bstockwelldev/agent-graph-sdk";

/**
 * GenUI surfaces: what a `human_gate` node's `genuiCheckpointSurfaceJson`
 * renders while a run is paused (Run panel checkpoint, inspector preview,
 * /genui library). Ported from micro-ui-agent-builder's genuiNodeSchema and
 * extended in resource-forms-consistency-plan.md slice 5: Approval, Chart,
 * Table, Diagram, KeyValue, Diff, Select, Checkbox and Markdown, plus `$ref`
 * data binding.
 *
 * `$ref`: a data-ish prop may be `{"$ref": "/nodes/<id>/output"}`, a JSON
 * Pointer (RFC 6901) into the paused run's data (`GenuiData`), resolved at
 * render time. Anything else stays literal.
 */

export const genuiRefSchema = z.object({ $ref: z.string().startsWith("/") }).strict();
export type GenuiRef = z.infer<typeof genuiRefSchema>;

const refOr = <T extends z.ZodTypeAny>(schema: T) => z.union([genuiRefSchema, schema]);

type Row = Record<string, unknown>;
const rowsSchema = refOr(z.array(z.record(z.unknown())));
const optionSchema = z.union([z.string(), z.object({ value: z.string(), label: z.string().optional() })]);
const columnSchema = z.union([z.string(), z.object({ key: z.string(), label: z.string().optional() })]);

export type GenuiNode =
  | { type: "Stack"; id?: string; props?: { gap?: number; direction?: "col" | "row" }; children: GenuiNode[] }
  | { type: "Text"; id?: string; props: { content: string | GenuiRef } }
  | { type: "Markdown"; id?: string; props: { content: string | GenuiRef } }
  | { type: "Button"; id: string; props: { label: string; actionId?: string } }
  | { type: "Card"; id?: string; props?: { title?: string }; children?: GenuiNode[] }
  | { type: "FormField"; id: string; props: { label: string; inputType?: "text" | "number"; placeholder?: string } }
  | { type: "Select"; id: string; props: { label: string; options: z.infer<typeof optionSchema>[] } }
  | { type: "Checkbox"; id: string; props: { label: string } }
  | { type: "Approval"; id?: string; props?: { title?: string; summary?: string | GenuiRef; approveLabel?: string; rejectLabel?: string } }
  | {
      type: "Chart";
      id?: string;
      props: { kind?: "bar" | "line" | "area"; data: Row[] | GenuiRef; x: string; y: string | string[]; title?: string; height?: number };
    }
  | { type: "Table"; id?: string; props: { rows: Row[] | GenuiRef; columns?: z.infer<typeof columnSchema>[]; caption?: string } }
  | { type: "KeyValue"; id?: string; props: { items: Row | { label: string; value: unknown }[] | GenuiRef; title?: string } }
  | { type: "Diff"; id?: string; props: { before: unknown; after: unknown; title?: string } }
  | { type: "Diagram"; id?: string; props: { source: string | GenuiRef; title?: string } };

export const genuiNodeSchema: z.ZodType<GenuiNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("Stack"),
      id: z.string().optional(),
      props: z.object({ gap: z.number().min(0).max(64).optional(), direction: z.enum(["col", "row"]).optional() }).optional(),
      children: z.array(genuiNodeSchema),
    }),
    z.object({ type: z.literal("Text"), id: z.string().optional(), props: z.object({ content: refOr(z.string()) }) }),
    z.object({ type: z.literal("Markdown"), id: z.string().optional(), props: z.object({ content: refOr(z.string()) }) }),
    z.object({ type: z.literal("Button"), id: z.string(), props: z.object({ label: z.string(), actionId: z.string().optional() }) }),
    z.object({
      type: z.literal("Card"),
      id: z.string().optional(),
      props: z.object({ title: z.string().optional() }).optional(),
      children: z.array(genuiNodeSchema).optional(),
    }),
    z.object({
      type: z.literal("FormField"),
      id: z.string(),
      props: z.object({ label: z.string(), inputType: z.enum(["text", "number"]).optional(), placeholder: z.string().optional() }),
    }),
    z.object({ type: z.literal("Select"), id: z.string(), props: z.object({ label: z.string(), options: z.array(optionSchema).min(1) }) }),
    z.object({ type: z.literal("Checkbox"), id: z.string(), props: z.object({ label: z.string() }) }),
    z.object({
      type: z.literal("Approval"),
      id: z.string().optional(),
      props: z
        .object({
          title: z.string().optional(),
          summary: refOr(z.string()).optional(),
          approveLabel: z.string().optional(),
          rejectLabel: z.string().optional(),
        })
        .optional(),
    }),
    z.object({
      type: z.literal("Chart"),
      id: z.string().optional(),
      props: z.object({
        kind: z.enum(["bar", "line", "area"]).optional(),
        data: rowsSchema,
        x: z.string(),
        y: z.union([z.string(), z.array(z.string()).min(1).max(8)]),
        title: z.string().optional(),
        height: z.number().min(120).max(480).optional(),
      }),
    }),
    z.object({
      type: z.literal("Table"),
      id: z.string().optional(),
      props: z.object({ rows: rowsSchema, columns: z.array(columnSchema).optional(), caption: z.string().optional() }),
    }),
    z.object({
      type: z.literal("KeyValue"),
      id: z.string().optional(),
      props: z.object({
        items: refOr(z.union([z.array(z.object({ label: z.string(), value: z.unknown() })), z.record(z.unknown())])),
        title: z.string().optional(),
      }),
    }),
    z.object({ type: z.literal("Diff"), id: z.string().optional(), props: z.object({ before: z.unknown(), after: z.unknown(), title: z.string().optional() }) }),
    z.object({ type: z.literal("Diagram"), id: z.string().optional(), props: z.object({ source: refOr(z.string()), title: z.string().optional() }) }),
  ]),
) as z.ZodType<GenuiNode>;

export const genuiSurfaceSchema = z.object({ root: genuiNodeSchema });
export type GenuiSurface = { root: GenuiNode };

export type ParsedGenuiSurface = { surface: GenuiSurface; error: null } | { surface: null; error: string | null };

/** The surface, or why it isn't one (`error: null` for blank input). */
export function parseGenuiSurface(raw: string): ParsedGenuiSurface {
  const trimmed = raw.trim();
  if (!trimmed) return { surface: null, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { surface: null, error: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const result = genuiSurfaceSchema.safeParse(parsed);
  if (result.success) return { surface: result.data as GenuiSurface, error: null };
  const issue = result.error.issues[0];
  const where = issue.path.length ? issue.path.join(".") : "surface";
  return { surface: null, error: `${where}: ${issue.message}` };
}

/** Returns null instead of throwing -- used for live-preview-while-typing. */
export function tryParseGenuiSurface(raw: string): GenuiSurface | null {
  return parseGenuiSurface(raw).surface;
}

// ---------------------------------------------------------------- $ref data

/** What a `$ref` points into: the run's input and each node's latest trace. */
export type GenuiData = {
  input: Record<string, unknown>;
  nodes: Record<string, { status: string; input: unknown; output: unknown }>;
};

export const EMPTY_GENUI_DATA: GenuiData = { input: {}, nodes: {} };

export function genuiDataFromRun(input: Record<string, unknown> | undefined, traces: Record<string, NodeTrace> | NodeTrace[]): GenuiData {
  const list = Array.isArray(traces) ? traces : Object.values(traces);
  return {
    input: input ?? {},
    nodes: Object.fromEntries(list.map((trace) => [trace.node_id, { status: trace.status, input: trace.input, output: trace.output }])),
  };
}

export function isGenuiRef(value: unknown): value is GenuiRef {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { $ref?: unknown }).$ref === "string";
}

/** RFC 6901. A string that is itself JSON is parsed on the way through, since
 * node outputs are often JSON text (an llm's structured answer). */
export function resolvePointer(data: unknown, pointer: string): { found: true; value: unknown } | { found: false } {
  if (pointer === "" || pointer === "/") return { found: true, value: data };
  let current: unknown = data;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
      } catch {
        return { found: false };
      }
    }
    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false };
      current = current[index];
    } else if (current !== null && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}

/** A prop's value with every `$ref` in it resolved (at any depth, so a
 * KeyValue item or a table cell can point into the run too); `missing`
 * names the first one that didn't resolve. */
export function resolveValue(value: unknown, data: GenuiData | null): { value: unknown; missing: string | null } {
  if (isGenuiRef(value)) {
    if (!data) return { value: undefined, missing: value.$ref };
    const hit = resolvePointer(data, value.$ref);
    return hit.found ? { value: hit.value, missing: null } : { value: undefined, missing: value.$ref };
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => resolveValue(item, data));
    return { value: items.map((item) => item.value), missing: items.find((item) => item.missing)?.missing ?? null };
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => [key, resolveValue(item, data)] as const);
    return {
      value: Object.fromEntries(entries.map(([key, item]) => [key, item.value])),
      missing: entries.find(([, item]) => item.missing)?.[1].missing ?? null,
    };
  }
  return { value, missing: null };
}

/** Rows for Chart/Table: an array of objects, or a JSON string of one. */
export function asRows(value: unknown): Row[] | null {
  let current = value;
  if (typeof current === "string") {
    try {
      current = JSON.parse(current);
    } catch {
      return null;
    }
  }
  return Array.isArray(current) && current.every((row) => row !== null && typeof row === "object" && !Array.isArray(row)) ? (current as Row[]) : null;
}

/** Plain text for a value: strings as-is, everything else as JSON. */
export function displayValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}
