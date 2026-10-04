import dagre from "@dagrejs/dagre";
import type { LineageGraph, LineageGraphNode } from "@bstockwelldev/agent-graph-sdk";

// Retrieval lineage as a top-to-bottom picture (it lives in a narrow panel): documents → chunks → runs →
// graph nodes (backend/app/knowledge.py's `knowledge_lineage_graph`). Pure
// layout so it can be tested without a DOM.

export const LINEAGE_NODE_WIDTH = 150;
export const LINEAGE_NODE_HEIGHT = 34;

export type PositionedLineageNode = LineageGraphNode & { x: number; y: number };
export type PositionedLineageEdge = {
  source: string;
  target: string;
  kind: string;
  score: number | null;
  points: { x: number; y: number }[];
};
export type LineageLayout = { nodes: PositionedLineageNode[]; edges: PositionedLineageEdge[]; width: number; height: number };

const RANK: Record<LineageGraphNode["kind"], number> = { document: 0, chunk: 1, run: 2, node: 3 };

export function layoutLineageGraph(graph: LineageGraph): LineageLayout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 10, ranksep: 22, marginx: 4, marginy: 4 });
  g.setDefaultEdgeLabel(() => ({}));
  // Stable order: by column, then label, so the same lineage draws the same way.
  const ordered = [...graph.nodes].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.label.localeCompare(b.label));
  for (const node of ordered) g.setNode(node.id, { width: LINEAGE_NODE_WIDTH, height: LINEAGE_NODE_HEIGHT });
  const known = new Set(ordered.map((node) => node.id));
  const edges = graph.edges.filter((edge) => known.has(edge.source) && known.has(edge.target));
  for (const edge of edges) g.setEdge(edge.source, edge.target);
  dagre.layout(g);
  const size = g.graph() as { width?: number; height?: number };
  return {
    nodes: ordered.map((node) => {
      const box = g.node(node.id);
      return { ...node, x: box.x - LINEAGE_NODE_WIDTH / 2, y: box.y - LINEAGE_NODE_HEIGHT / 2 };
    }),
    edges: edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      score: edge.score ?? null,
      points: (g.edge(edge.source, edge.target)?.points ?? []) as { x: number; y: number }[],
    })),
    width: Math.ceil(size.width ?? 0),
    height: Math.ceil(size.height ?? 0),
  };
}

/** What a box says to a screen reader, and on hover. */
export function describeLineageNode(node: LineageGraphNode): string {
  const meta = node.meta ?? {};
  switch (node.kind) {
    case "document": {
      const versions = Array.isArray(meta.versions) && meta.versions.length > 0 ? ` (version ${(meta.versions as number[]).join(", ")})` : "";
      return `Document ${node.label}${versions}`;
    }
    case "chunk":
      return `Chunk: ${typeof meta.preview === "string" ? meta.preview : node.label}${meta.removed ? " (no longer in the knowledge base)" : ""}`;
    case "run":
      return `Run ${node.label}${meta.releaseId ? ` from release ${String(meta.releaseId)}` : ""}`;
    case "node":
      return `Node ${node.label} in run ${String(meta.runId ?? "")}`;
  }
}

export type KnowledgeHit = {
  documentId: string;
  documentName: string;
  documentVersion: number | null;
  chunkId: string;
  rank: number;
  score: number;
  preview: string;
};

/** The knowledge chunks an llm node's trace says it used (`input.knowledgeHits`), ignoring anything malformed. */
export function knowledgeHitsOf(input: unknown): KnowledgeHit[] {
  if (!input || typeof input !== "object") return [];
  const raw = (input as { knowledgeHits?: unknown }).knowledgeHits;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((hit): KnowledgeHit[] => {
    if (!hit || typeof hit !== "object") return [];
    const h = hit as Record<string, unknown>;
    if (typeof h.documentName !== "string" || typeof h.chunkId !== "string" || typeof h.score !== "number") return [];
    return [
      {
        documentId: String(h.documentId ?? ""),
        documentName: h.documentName,
        documentVersion: typeof h.documentVersion === "number" ? h.documentVersion : null,
        chunkId: h.chunkId,
        rank: typeof h.rank === "number" ? h.rank : 0,
        score: h.score,
        preview: typeof h.preview === "string" ? h.preview : "",
      },
    ];
  });
}
