/**
 * Raw JSON/YAML config editor (studio-config-editor-and-console-plan.md
 * §6, Phase 1 — node/edge scope). Pure parse/format helpers behind
 * NodeInspector's/EdgeInspector's new "Raw" tab/section.
 *
 * There is no per-node-type Zod schema in the SDK (`GraphNode.config` is
 * `Record<string, unknown>`, untyped by design — the typed shape lives
 * only in the backend's `node_configs.py`), so this can only enforce
 * JSON-syntax and top-level-shape validity client-side. A raw edit still
 * goes through the same async live-validation pipeline every Configure-tab
 * edit already goes through (GraphEditor.tsx's debounced
 * `client.graphs.validate` call) once applied — this editor is exactly as
 * strict as the typed form, not more, not less.
 */

import { edgeTransformSchema, type EdgeTransform } from "@bstockwelldev/agent-graph-sdk";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type ConfigParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export function parseConfigJson(text: string): ConfigParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: 'Config must be a JSON object, e.g. { "key": "value" }.' };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function formatConfigJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

// --- Edge raw config -----------------------------------------------------
// The fields an edge edit actually applies (GraphEditor's patchEdgeById):
// kind, condition, source/target port and transform.

const EDGE_KINDS = ["sequence", "conditional", "default"] as const;
export type EdgeKindValue = (typeof EDGE_KINDS)[number];

export interface EdgeRawConfig {
  kind: EdgeKindValue;
  condition: string | null;
  source_port: string | null;
  target_port: string | null;
  transform: EdgeTransform | null;
}

export type EdgeConfigParseResult = { ok: true; value: EdgeRawConfig } | { ok: false; error: string };

/** Drops unset (null/undefined) transform fields so the raw view stays readable. */
export function compactTransform(transform: EdgeTransform | null | undefined): EdgeTransform | null {
  if (!transform) return null;
  return Object.fromEntries(Object.entries(transform).filter(([, v]) => v !== null && v !== undefined)) as EdgeTransform;
}

export function formatEdgeRawConfig(edge: {
  kind: string;
  condition?: string | null;
  source_port?: string | null;
  target_port?: string | null;
  transform?: EdgeTransform | null;
}): string {
  return JSON.stringify(
    {
      kind: edge.kind,
      condition: edge.condition ?? null,
      source_port: edge.source_port ?? null,
      target_port: edge.target_port ?? null,
      transform: compactTransform(edge.transform),
    },
    null,
    2,
  );
}

export function parseEdgeRawConfig(text: string): EdgeConfigParseResult {
  const base = parseConfigJson(text);
  if (!base.ok) return base;
  const { kind, condition, transform, source_port, target_port } = base.value;
  if (typeof kind !== "string" || !(EDGE_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: `"kind" must be one of: ${EDGE_KINDS.join(", ")}.` };
  }
  if (condition !== null && condition !== undefined && typeof condition !== "string") {
    return { ok: false, error: '"condition" must be a string or null.' };
  }
  for (const [key, value] of Object.entries({ source_port, target_port })) {
    if (value !== null && value !== undefined && (typeof value !== "string" || !value.trim())) {
      return { ok: false, error: `"${key}" must be a port id or null.` };
    }
  }
  let parsedTransform: EdgeTransform | null = null;
  if (transform !== null && transform !== undefined) {
    const result = edgeTransformSchema.safeParse(transform);
    if (!result.success) {
      const detail = result.error.issues.map((issue) => `transform.${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
      return { ok: false, error: detail };
    }
    parsedTransform = compactTransform(result.data);
  }
  return {
    ok: true,
    value: {
      kind: kind as EdgeKindValue,
      condition: (condition as string | null) ?? null,
      source_port: (source_port as string | null) ?? null,
      target_port: (target_port as string | null) ?? null,
      transform: parsedTransform,
    },
  };
}

// --- JSON / YAML views ----------------------------------------------------
// JSON stays the canonical format (API, storage, the validators above); YAML
// is an editing view only. YAML text is converted to JSON text before any
// validator runs, and a value is always formatted as JSON first, so every
// parse/format pair above works unchanged for both syntaxes.

export type RawSyntax = "json" | "yaml";

export const RAW_SYNTAX_STORAGE_KEY = "agb.rawEditor.syntax";

export type SyntaxConversion = { ok: true; json: string } | { ok: false; error: string };

/** Text in `syntax` -> canonical JSON text (pretty-printed). */
export function toCanonicalJson(text: string, syntax: RawSyntax): SyntaxConversion {
  if (syntax === "json") return { ok: true, json: text };
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    return { ok: false, error: `Invalid YAML: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}` };
  }
  return { ok: true, json: JSON.stringify(parsed ?? null, null, 2) };
}

/** Canonical JSON text -> text in `syntax`. `json` must already be valid JSON. */
export function fromCanonicalJson(json: string, syntax: RawSyntax): string {
  if (syntax === "json") return json;
  return stringifyYaml(JSON.parse(json), { lineWidth: 0 });
}

export function readRawSyntax(): RawSyntax {
  try {
    return window.localStorage.getItem(RAW_SYNTAX_STORAGE_KEY) === "yaml" ? "yaml" : "json";
  } catch {
    return "json";
  }
}

export function writeRawSyntax(syntax: RawSyntax): void {
  try {
    window.localStorage.setItem(RAW_SYNTAX_STORAGE_KEY, syntax);
  } catch {
    // Storage unavailable — the choice just isn't remembered.
  }
}
