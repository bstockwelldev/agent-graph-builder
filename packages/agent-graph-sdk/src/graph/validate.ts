import type { Diagnostic, GraphDefinition } from "../types.js";
import { adjacencyHasCycle } from "./traverse.js";

/**
 * Local structural validation (SDK 5/7, STO-620): the backend compiler's
 * cheap graph checks (backend/app/compiler.py `validate_graph`,
 * `_validate_groups`, `_validate_layers`), run in-process with no request.
 * Same codes, severities, node/edge ids and messages. The shared fixtures
 * in contract/structural-fixtures.json keep the two in step: the backend's
 * pytest and this module's vitest both check them.
 *
 * Only structure is covered. Node configs, tool and resource bindings,
 * ports, subgraph targets and policies need the server's registries, so
 * `client.graphs.validate` stays the authority before a run or publish.
 */

export const STRUCTURAL_CODES = [
  "BRANCH_MISSING_FALLBACK",
  "BRANCH_NO_CONDITIONAL_EDGES",
  "BRANCH_NO_OUTGOING_EDGES",
  "GRAPH_CONDITIONAL_EDGE_MISSING_CONDITION",
  "GRAPH_DUPLICATE_EDGE_ID",
  "GRAPH_DUPLICATE_NODE_ID",
  "GRAPH_EDGE_UNKNOWN_SOURCE",
  "GRAPH_EDGE_UNKNOWN_TARGET",
  "GRAPH_INVALID_CYCLE",
  "GRAPH_MISSING_ENTRY_NODE",
  "GRAPH_UNREACHABLE_NODE",
  "GROUP_OVERLAP",
  "GROUP_UNKNOWN_NODE",
  "LAYER_UNKNOWN",
  "ROUTER_MISSING_FALLBACK",
  "ROUTER_NO_CONDITIONAL_EDGES",
  "ROUTER_NO_OUTGOING_EDGES",
] as const;

type Graph = Pick<GraphDefinition, "entry_node_id" | "nodes" | "edges" | "groups" | "layers">;

const error = (code: string, message: string, extra: Partial<Diagnostic> = {}): Diagnostic => ({
  severity: "error",
  code,
  message,
  blocking: true,
  ...extra,
});
const warning = (code: string, message: string, extra: Partial<Diagnostic> = {}): Diagnostic => ({
  severity: "warning",
  code,
  message,
  blocking: false,
  ...extra,
});
const quote = (value: string) => `'${value}'`;

function counts(ids: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** Structural diagnostics for a graph, in the backend compiler's order. */
export function validateStructure(graph: Graph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  for (const [id, count] of counts(graph.nodes.map((node) => node.id))) {
    if (count > 1)
      diagnostics.push(
        error("GRAPH_DUPLICATE_NODE_ID", `Node id ${quote(id)} is used by ${count} nodes; ids must be unique`, { category: "structure", node_id: id }),
      );
  }
  for (const [id, count] of counts(graph.edges.map((edge) => edge.id))) {
    if (count > 1)
      diagnostics.push(
        error("GRAPH_DUPLICATE_EDGE_ID", `Edge id ${quote(id)} is used by ${count} edges; ids must be unique`, { category: "structure", edge_id: id }),
      );
  }

  if (!nodeIds.has(graph.entry_node_id)) {
    diagnostics.push(error("GRAPH_MISSING_ENTRY_NODE", `entryNodeId ${quote(graph.entry_node_id)} does not reference a node in this graph`));
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source))
      diagnostics.push(
        error("GRAPH_EDGE_UNKNOWN_SOURCE", `Edge ${quote(edge.id)} references unknown source node ${quote(edge.source)}`, { node_id: edge.source, edge_id: edge.id }),
      );
    if (!nodeIds.has(edge.target))
      diagnostics.push(
        error("GRAPH_EDGE_UNKNOWN_TARGET", `Edge ${quote(edge.id)} references unknown target node ${quote(edge.target)}`, { node_id: edge.target, edge_id: edge.id }),
      );
    if (edge.kind === "conditional" && !edge.condition)
      diagnostics.push(
        error("GRAPH_CONDITIONAL_EDGE_MISSING_CONDITION", `Conditional edge ${quote(edge.id)} has no condition string`, { node_id: edge.source, edge_id: edge.id }),
      );
  }

  // Reachability from the entry node, over edges whose source exists.
  const adjacency = new Map<string, string[]>([...nodeIds].map((id) => [id, []]));
  for (const edge of graph.edges) adjacency.get(edge.source)?.push(edge.target);
  const reachable = new Set<string>();
  if (nodeIds.has(graph.entry_node_id)) {
    const stack = [graph.entry_node_id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      stack.push(...(adjacency.get(current) ?? []));
    }
  }
  for (const node of graph.nodes) {
    if (!reachable.has(node.id))
      diagnostics.push(warning("GRAPH_UNREACHABLE_NODE", `Node ${quote(node.id)} is not reachable from the entry node`, { node_id: node.id }));
  }

  if (adjacencyHasCycle(adjacency)) {
    diagnostics.push(error("GRAPH_INVALID_CYCLE", "Graph contains a cycle; this POC supports acyclic graphs only"));
  }

  for (const node of graph.nodes) {
    if (node.type !== "router" && node.type !== "branch") continue;
    const prefix = node.type === "router" ? "ROUTER" : "BRANCH";
    const outgoing = graph.edges.filter((edge) => edge.source === node.id);
    if (outgoing.length === 0) {
      diagnostics.push(error(`${prefix}_NO_OUTGOING_EDGES`, `${node.type} node ${quote(node.id)} has no outgoing edges`, { node_id: node.id }));
    } else if (!outgoing.some((edge) => edge.kind === "default")) {
      diagnostics.push(
        error(`${prefix}_MISSING_FALLBACK`, `${node.type} node ${quote(node.id)} has no default/fallback outgoing edge`, { node_id: node.id }),
      );
    } else if (!outgoing.some((edge) => edge.kind === "conditional")) {
      diagnostics.push(
        warning(`${prefix}_NO_CONDITIONAL_EDGES`, `${node.type} node ${quote(node.id)} only has a default edge; it never branches`, { node_id: node.id }),
      );
    }
  }

  const owner = new Map<string, string>();
  for (const group of graph.groups ?? []) {
    for (const nodeId of group.node_ids) {
      if (!nodeIds.has(nodeId)) {
        diagnostics.push(
          warning("GROUP_UNKNOWN_NODE", `Group ${quote(group.label)} refers to missing node ${quote(nodeId)}.`, { category: "structure" }),
        );
      } else if (owner.has(nodeId) && owner.get(nodeId) !== group.id) {
        diagnostics.push(warning("GROUP_OVERLAP", `Node ${quote(nodeId)} is in more than one group.`, { category: "structure", node_id: nodeId }));
      } else {
        owner.set(nodeId, group.id);
      }
    }
  }

  const layers = new Set((graph.layers ?? []).map((layer) => layer.id));
  for (const node of graph.nodes) {
    const layer = node.extensions?.layer;
    if (typeof layer === "string" && layer && !layers.has(layer)) {
      diagnostics.push(warning("LAYER_UNKNOWN", `Node ${quote(node.id)} is on undefined layer ${quote(layer)}.`, { category: "structure", node_id: node.id }));
    }
  }

  return diagnostics;
}
