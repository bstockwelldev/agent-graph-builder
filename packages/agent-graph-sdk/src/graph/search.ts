import type { NodeType } from "../types.js";

/**
 * Find-on-canvas matching (large-graph complexity, Wave 7a / STO-610).
 * A query matches a node's id, its display label, or any string value in
 * its config; `type:<nodeType>` narrows by node type and can be combined
 * with text ("type:llm qwen"). Results rank exact id matches first, then
 * id/label prefix matches, then everything else, keeping canvas order.
 */

export type SearchableNode = { id: string; data: { nodeType: NodeType | string; label?: string; config?: Record<string, unknown> } };

export function parseQuery(query: string): { type: string | null; text: string } {
  let type: string | null = null;
  const rest: string[] = [];
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const match = token.match(/^type:(\S+)$/i);
    if (match) type = match[1].toLowerCase();
    else rest.push(token);
  }
  return { type, text: rest.join(" ").toLowerCase() };
}

function configText(config: Record<string, unknown> | undefined): string {
  if (!config) return "";
  const parts: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(config);
  return parts.join("\n").toLowerCase();
}

/** Matching node ids, best first. An empty query matches nothing. */
export function searchNodes(nodes: readonly SearchableNode[], query: string): string[] {
  const { type, text } = parseQuery(query);
  if (!type && !text) return [];
  const ranked: { id: string; rank: number; index: number }[] = [];
  nodes.forEach((node, index) => {
    if (type && String(node.data.nodeType).toLowerCase() !== type) return;
    if (!text) {
      ranked.push({ id: node.id, rank: 2, index });
      return;
    }
    const id = node.id.toLowerCase();
    const label = (node.data.label ?? "").toLowerCase();
    let rank: number | null = null;
    if (id === text) rank = 0;
    else if (id.startsWith(text) || label.startsWith(text)) rank = 1;
    else if (id.includes(text) || label.includes(text) || configText(node.data.config).includes(text)) rank = 2;
    if (rank !== null) ranked.push({ id: node.id, rank, index });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((r) => r.id);
}
