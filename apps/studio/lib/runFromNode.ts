/**
 * Phase 10 Slice C, "Run from selected node"
 * (docs/planning/features/studio-shell-ux-gap-analysis.md): the ancestor
 * set of a selected node, walked backward over the graph's edges. The
 * caller mocks each returned id's output (see GraphEditor.tsx's
 * handleRunFromNode) so the backend's existing fixture_node_outputs
 * mechanism short-circuits them instead of invoking their real executors.
 */
export function computeAncestorNodeIds(
  nodeId: string,
  edges: { source: string; target: string }[],
): string[] {
  const incomingBySource = new Map<string, string[]>();
  for (const edge of edges) {
    const sources = incomingBySource.get(edge.target) ?? [];
    sources.push(edge.source);
    incomingBySource.set(edge.target, sources);
  }

  const visited = new Set<string>();
  const queue = incomingBySource.get(nodeId) ?? [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === nodeId || visited.has(current)) continue;
    visited.add(current);
    for (const parent of incomingBySource.get(current) ?? []) {
      if (!visited.has(parent)) queue.push(parent);
    }
  }
  return [...visited];
}
