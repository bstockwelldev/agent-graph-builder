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
 * `client.validateGraph` call) once applied — this editor is exactly as
 * strict as the typed form, not more, not less.
 */

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
// Deliberately narrower than the full GraphEdge shape: `patchFlowEdgeData`
// (NodeInspector.tsx) only ever actually applies `kind`/`condition` from a
// patch today — exposing source_port/target_port/transform here would let
// an edit look accepted while silently doing nothing, which is exactly
// what this editor's design spec says never to do.

const EDGE_KINDS = ["sequence", "conditional", "default"] as const;
export type EdgeKindValue = (typeof EDGE_KINDS)[number];

export interface EdgeRawConfig {
  kind: EdgeKindValue;
  condition: string | null;
}

export type EdgeConfigParseResult = { ok: true; value: EdgeRawConfig } | { ok: false; error: string };

export function formatEdgeRawConfig(edge: { kind: string; condition?: string | null }): string {
  return JSON.stringify({ kind: edge.kind, condition: edge.condition ?? null }, null, 2);
}

export function parseEdgeRawConfig(text: string): EdgeConfigParseResult {
  const base = parseConfigJson(text);
  if (!base.ok) return base;
  const { kind, condition } = base.value;
  if (typeof kind !== "string" || !(EDGE_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: `"kind" must be one of: ${EDGE_KINDS.join(", ")}.` };
  }
  if (condition !== null && condition !== undefined && typeof condition !== "string") {
    return { ok: false, error: '"condition" must be a string or null.' };
  }
  return { ok: true, value: { kind: kind as EdgeKindValue, condition: (condition as string | null) ?? null } };
}
