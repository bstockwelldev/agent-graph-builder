import type { EdgeKind, GraphDefinition, GraphEdge, GraphNode, NodeType } from "../types.js";
import { defaultConfig, withUserLabel } from "./nodes.js";

/**
 * Immutable graph edits (SDK 5/7 -- docs/planning/features/
 * sdk-hardening-plan.md, Phase 5a, STO-620). Each returns a new
 * GraphDefinition and leaves its input untouched; each throws on a
 * reference that can't be satisfied (an unknown node, a duplicate id), so
 * a bad edit fails where it's made rather than at compile time.
 */

export type NewNode = {
  id?: string;
  type: NodeType;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
  label?: string;
};

export type NewEdge = {
  id?: string;
  source: string;
  target: string;
  kind?: EdgeKind;
  condition?: string;
};

/** `prefix_1`, `prefix_2`, ... -- the first id not in `taken`. */
export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i += 1) if (!used.has(`${prefix}_${i}`)) return `${prefix}_${i}`;
}

function requireNode(graph: GraphDefinition, nodeId: string): GraphNode {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`No node ${JSON.stringify(nodeId)} in graph ${JSON.stringify(graph.id)}`);
  return node;
}

/** Adds a node (default config for its type, id `<type>_<n>` unless given). */
export function addNode(graph: GraphDefinition, input: NewNode): GraphDefinition {
  const id = input.id ?? nextId(input.type, graph.nodes.map((node) => node.id));
  if (graph.nodes.some((node) => node.id === id)) throw new Error(`Node id ${JSON.stringify(id)} already exists`);
  const extensions = withUserLabel(undefined, input.label);
  const node: GraphNode = {
    id,
    type: input.type,
    position: input.position ?? { x: 0, y: 0 },
    config: input.config ?? defaultConfig(input.type),
    ...(extensions ? { extensions } : {}),
  };
  return { ...graph, nodes: [...graph.nodes, node] };
}

/** Adds an edge between two existing nodes (`sequence` by default). */
export function connect(graph: GraphDefinition, input: NewEdge): GraphDefinition {
  requireNode(graph, input.source);
  requireNode(graph, input.target);
  const id = input.id ?? nextId("edge", graph.edges.map((edge) => edge.id));
  if (graph.edges.some((edge) => edge.id === id)) throw new Error(`Edge id ${JSON.stringify(id)} already exists`);
  const edge: GraphEdge = {
    id,
    source: input.source,
    target: input.target,
    kind: input.kind ?? "sequence",
    ...(input.condition !== undefined ? { condition: input.condition } : {}),
  };
  return { ...graph, edges: [...graph.edges, edge] };
}

/** Removes a node, its edges and its group memberships. Removing the entry
 * node is allowed; validation then reports GRAPH_MISSING_ENTRY_NODE. */
export function removeNode(graph: GraphDefinition, nodeId: string): GraphDefinition {
  requireNode(graph, nodeId);
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    ...(graph.groups ? { groups: graph.groups.map((group) => ({ ...group, node_ids: group.node_ids.filter((id) => id !== nodeId) })) } : {}),
  };
}

/** Merges `patch` into a node's config (`{ replace: true }` swaps it wholesale).
 * A key set to `undefined` is removed. */
export function setConfig(
  graph: GraphDefinition,
  nodeId: string,
  patch: Record<string, unknown>,
  options: { replace?: boolean } = {},
): GraphDefinition {
  requireNode(graph, nodeId);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const merged: Record<string, unknown> = options.replace ? { ...patch } : { ...node.config, ...patch };
      for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
      return { ...node, config: merged };
    }),
  };
}

/** Sets a node's display name (`extensions.label`); blank clears it. */
export function relabel(graph: GraphDefinition, nodeId: string, label: string | null): GraphDefinition {
  requireNode(graph, nodeId);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const { extensions: _previous, ...rest } = node;
      const extensions = withUserLabel(node.extensions, label);
      return extensions ? { ...rest, extensions } : rest;
    }),
  };
}
