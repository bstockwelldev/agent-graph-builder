import { graphDefinitionSchema, type GraphDefinition } from "@bstockwelldev/agent-graph-sdk";

/**
 * Raw JSON/YAML config editor (studio-config-editor-and-console-plan.md
 * §6, Phase 2 — graph scope). For copy-paste between graphs, backup, or
 * scripting — not a live-editing surface like the node/edge Raw tab.
 * Unlike node/edge config, a real Zod schema exists for the whole graph
 * (`graphDefinitionSchema`, exported from the SDK), so import gets full
 * structural validation, not just "is this a JSON object."
 */

export function exportGraphJson(graph: GraphDefinition): string {
  return JSON.stringify(graph, null, 2);
}

export type GraphImportResult = { ok: true; graph: GraphDefinition } | { ok: false; error: string };

export function importGraphJson(text: string): GraphImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const result = graphDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
      .join("; ");
    return { ok: false, error: `Not a valid graph: ${detail}` };
  }
  return { ok: true, graph: result.data };
}

/** The studio derives the entry node (first `input` node, else the first node) on save. */
export function derivedEntryNodeId(graph: Pick<GraphDefinition, "nodes">): string {
  return (graph.nodes.find((node) => node.type === "input") ?? graph.nodes[0])?.id ?? "";
}

/**
 * Graph-level raw editor: full schema validation (as import) plus the two
 * fields the editor can't change -- rejected rather than silently ignored.
 */
export function parseGraphRawConfig(json: string, graphId: string): { ok: true; value: GraphDefinition } | { ok: false; error: string } {
  const result = importGraphJson(json);
  if (!result.ok) return result;
  const graph = result.graph;
  if (graph.id !== graphId) {
    return { ok: false, error: `"id" can't be changed here (expected "${graphId}"). Export and import to create a copy.` };
  }
  const entry = derivedEntryNodeId(graph);
  if (graph.entry_node_id !== entry) {
    return { ok: false, error: `"entry_node_id" must be "${entry}": the entry is the first input node (or the first node).` };
  }
  return { ok: true, value: graph };
}
