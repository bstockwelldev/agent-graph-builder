// Copy, cut and paste on the canvas (canvas-workbench-ergonomics-plan.md §3).
// An in-app clipboard: nodes plus the edges between them, pasted with fresh
// ids so a paste never collides with what's already on the canvas.

type ClipNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  selected?: boolean;
};
type ClipEdge = {
  id: string;
  source: string;
  target: string;
  selected?: boolean;
};

export type CanvasClipboard<N extends ClipNode, E extends ClipEdge> = {
  nodes: N[];
  edges: E[];
};

/** The picked nodes and the edges with both ends among them. */
export function copyNodes<N extends ClipNode, E extends ClipEdge>(
  nodes: N[],
  edges: E[],
  ids: string[],
): CanvasClipboard<N, E> | null {
  const picked = new Set(ids);
  const copied = nodes.filter((node) => picked.has(node.id));
  if (copied.length === 0) return null;
  return {
    nodes: structuredClone(copied),
    edges: structuredClone(
      edges.filter(
        (edge) => picked.has(edge.source) && picked.has(edge.target),
      ),
    ),
  };
}

/** A new id for `prefix` that isn't taken; adds it to `taken`. */
export function freshId(
  prefix: string,
  taken: Set<string>,
  next: (prefix: string) => string,
): string {
  let id = next(prefix);
  while (taken.has(id)) id = next(prefix);
  taken.add(id);
  return id;
}

/**
 * The clipboard's nodes and edges with fresh ids, selected, and moved so
 * their top-left corner lands at `at` (default: 40px down-right of where
 * they were copied from, so a paste doesn't hide the original).
 */
export function pasteNodes<N extends ClipNode, E extends ClipEdge>(
  clipboard: CanvasClipboard<N, E>,
  takenIds: Iterable<string>,
  next: (prefix: string) => string,
  at?: { x: number; y: number },
): CanvasClipboard<N, E> {
  const taken = new Set(takenIds);
  const minX = Math.min(...clipboard.nodes.map((node) => node.position.x));
  const minY = Math.min(...clipboard.nodes.map((node) => node.position.y));
  const dx = at ? at.x - minX : 40;
  const dy = at ? at.y - minY : 40;
  const idMap = new Map<string, string>();
  const nodes = clipboard.nodes.map((node) => {
    const id = freshId(node.type ?? "node", taken, next);
    idMap.set(node.id, id);
    return {
      ...structuredClone(node),
      id,
      selected: true,
      position: { x: node.position.x + dx, y: node.position.y + dy },
    };
  });
  const edges = clipboard.edges.map((edge) => ({
    ...structuredClone(edge),
    id: freshId("e", taken, next),
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target,
    selected: false,
  }));
  return { nodes, edges };
}
