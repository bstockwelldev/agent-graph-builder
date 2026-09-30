// Focus mode (canvas-workbench-ergonomics-plan.md §10): the selected node and
// its neighbors within `hops` edges, in either direction. The whole
// upstream/downstream closure it used to light was most of any graph whose
// branches rejoin (5 of the demo's 8 nodes lit everything), so it looked like
// it did nothing; the dependency view ("Show upstream/downstream") still
// covers the closure.

export function neighborhoodNodeIds(nodeId: string, edges: { source: string; target: string }[], hops = 1): Set<string> {
  const neighbors = new Map<string, string[]>();
  for (const edge of edges) {
    neighbors.set(edge.source, [...(neighbors.get(edge.source) ?? []), edge.target]);
    neighbors.set(edge.target, [...(neighbors.get(edge.target) ?? []), edge.source]);
  }
  const lit = new Set([nodeId]);
  let frontier = [nodeId];
  for (let hop = 0; hop < hops && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of neighbors.get(id) ?? []) {
        if (lit.has(neighbor)) continue;
        lit.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return lit;
}

/** An edge stays lit only when both its ends are. */
export function isEdgeDimmed(edge: { source: string; target: string }, lit: Set<string> | null): boolean {
  return lit !== null && !(lit.has(edge.source) && lit.has(edge.target));
}
