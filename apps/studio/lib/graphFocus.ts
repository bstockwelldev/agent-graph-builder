/**
 * Phase 10 Slice D ("Focus mode" -- docs/planning/features/
 * studio-shell-ux-gap-analysis.md, studio-ux-revision-plan.md's "Selecting
 * a node can dim unrelated branches and emphasize inbound/outbound
 * paths"). Graphs here are acyclic (the compiler enforces this), so a
 * node's full inbound + outbound transitive closure is well-defined and
 * cheap to compute: it's exactly the set of nodes on some path through the
 * selected node, which is what stays at full opacity while everything
 * else -- an unrelated parallel branch -- gets dimmed.
 */
/** Which side of the node a dependency view keeps (Wave 7a, STO-610). */
export type FocusDirection = "both" | "upstream" | "downstream";

export function computeFocusNodeIds(
  nodeId: string,
  edges: { source: string; target: string }[],
  direction: FocusDirection = "both",
): Set<string> {
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const edge of edges) {
    forward.set(edge.source, [...(forward.get(edge.source) ?? []), edge.target]);
    backward.set(edge.target, [...(backward.get(edge.target) ?? []), edge.source]);
  }

  const visited = new Set<string>([nodeId]);
  const walk = (adjacency: Map<string, string[]>) => {
    const queue = [...(adjacency.get(nodeId) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      queue.push(...(adjacency.get(current) ?? []));
    }
  };
  if (direction !== "upstream") walk(forward);
  if (direction !== "downstream") walk(backward);
  return visited;
}
