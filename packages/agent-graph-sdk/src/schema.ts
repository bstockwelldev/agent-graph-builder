import type { EdgeKind, GraphDefinition, GraphEdge, GraphNode, NodeType } from "./types.js";

export const NODE_TYPES: readonly NodeType[] = [
  "input",
  "prompt",
  "llm",
  "tool",
  "router",
  "output",
  "guardrail",
  "rubric",
  "human_gate",
  "tool_loop",
  "code_exec",
  "branch",
];
export const EDGE_KINDS: readonly EdgeKind[] = ["sequence", "conditional", "default"];

export function isNodeType(value: string): value is NodeType {
  return (NODE_TYPES as readonly string[]).includes(value);
}

export function isEdgeKind(value: string): value is EdgeKind {
  return (EDGE_KINDS as readonly string[]).includes(value);
}

export function getNodeById(graph: GraphDefinition, nodeId: string): GraphNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function getOutgoingEdges(graph: GraphDefinition, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeId);
}

export function getIncomingEdges(graph: GraphDefinition, nodeId: string): GraphEdge[] {
  return graph.edges.filter((edge) => edge.target === nodeId);
}

export function fingerprintGraphSemantics(graph: GraphDefinition): string {
  const payload = {
    id: graph.id,
    name: graph.name,
    entry_node_id: graph.entry_node_id,
    orientation: graph.orientation ?? "auto",
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      config: node.config,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      condition: edge.condition ?? null,
    })),
  };
  return JSON.stringify(payload);
}

export function fingerprintGraph(graph: GraphDefinition): string {
  const payload = {
    id: graph.id,
    name: graph.name,
    entry_node_id: graph.entry_node_id,
    orientation: graph.orientation ?? "auto",
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      config: node.config,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      condition: edge.condition ?? null,
    })),
  };
  return JSON.stringify(payload);
}
