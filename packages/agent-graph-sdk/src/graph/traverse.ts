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

type EdgeLike = { source: string; target: string };
type GraphLike = { entry_node_id: string; nodes: readonly { id: string }[]; edges: readonly EdgeLike[] };

function walk(start: readonly string[], edges: readonly EdgeLike[], forward: boolean): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const [from, to] = forward ? [edge.source, edge.target] : [edge.target, edge.source];
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  }
  const visited = new Set<string>();
  const stack = [...start];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
  return visited;
}

/** SDK 5/7: every node reachable from `nodeId` (excluding it, unless a cycle returns to it). */
export function downstream(graph: Pick<GraphLike, "edges">, nodeId: string): Set<string> {
  return walk([nodeId], graph.edges, true);
}

/** Every node `nodeId` is reachable from (excluding it, unless a cycle returns to it). */
export function upstream(graph: Pick<GraphLike, "edges">, nodeId: string): Set<string> {
  return walk([nodeId], graph.edges, false);
}

/** The nodes a run can reach: `start` (default the entry node) and everything
 * downstream of it -- empty when the start node doesn't exist. Mirrors the
 * backend compiler's reachability pass. */
export function reachableFrom(graph: GraphLike, start: string = graph.entry_node_id): Set<string> {
  if (!graph.nodes.some((node) => node.id === start)) return new Set();
  const reached = walk([start], graph.edges, true);
  reached.add(start);
  return reached;
}

/** True when the edges form a directed cycle. */
export function hasCycle(graph: Pick<GraphLike, "edges">): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  return adjacencyHasCycle(adjacency);
}

/** @internal Depth-first cycle check over an adjacency map. */
export function adjacencyHasCycle(adjacency: ReadonlyMap<string, readonly string[]>): boolean {
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): boolean => {
    state.set(id, "visiting");
    for (const next of adjacency.get(id) ?? []) {
      if (state.get(next) === "visiting") return true;
      if (!state.has(next) && visit(next)) return true;
    }
    state.set(id, "done");
    return false;
  };
  return [...adjacency.keys()].some((id) => !state.has(id) && visit(id));
}
