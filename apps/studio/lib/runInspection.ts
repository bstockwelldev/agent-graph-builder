import type { Edge } from "@xyflow/react";
import { color } from "./graph-theme";
import type { EdgeKind, GraphEdge, NodeTrace, NodeType, PlatformEvent, RouteDecision } from "@bstockwelldev/agent-graph-sdk";

export type ExecutedPath = {
  executedNodeIds: Set<string>;
  highlightEdgeIds: Set<string>;
  dimNodeIds: Set<string>;
  dimEdgeIds: Set<string>;
};

const NODE_TYPES: NodeType[] = [
  "input",
  "prompt",
  "llm",
  "tool",
  "router",
  "output",
  "guardrail",
  "rubric",
  "branch",
  "tool_loop",
  "code_exec",
  "human_gate",
];

function nodeTypeFromEvent(event: PlatformEvent, fallback?: NodeType): NodeType {
  const raw = event.payload.nodeType;
  if (typeof raw === "string" && (NODE_TYPES as string[]).includes(raw)) {
    return raw as NodeType;
  }
  return fallback ?? "input";
}

/** Rebuild node traces from a completed run's event log when GET /nodes 404s. */
export function tracesFromEvents(events: PlatformEvent[]): NodeTrace[] {
  const traces = new Map<string, NodeTrace>();
  for (const event of events) {
    const nodeId = event.node_id;
    if (!nodeId) continue;
    const existing = traces.get(nodeId);
    const nodeType = nodeTypeFromEvent(event, existing?.node_type);

    if (event.event_type === "node.started") {
      traces.set(nodeId, {
        node_id: nodeId,
        node_type: nodeType,
        status: "running",
        input: null,
        output: null,
        started_at: event.occurred_at,
      });
      continue;
    }

    if (event.event_type === "node.completed") {
      traces.set(nodeId, {
        node_id: nodeId,
        node_type: nodeType,
        status: "succeeded",
        input: event.payload.input ?? existing?.input ?? null,
        output: event.payload.output ?? existing?.output ?? null,
        started_at: existing?.started_at ?? event.occurred_at,
        completed_at: event.occurred_at,
      });
      continue;
    }

    if (event.event_type === "node.failed") {
      traces.set(nodeId, {
        node_id: nodeId,
        node_type: nodeType,
        status: "failed",
        input: existing?.input ?? null,
        output: existing?.output ?? null,
        started_at: existing?.started_at ?? event.occurred_at,
        completed_at: event.occurred_at,
        error: String(event.payload.error ?? "node failed"),
      });
    }
  }
  return [...traces.values()];
}

export function normalizeRouteDecisions(
  decisions: Array<RouteDecision | Record<string, string>>,
): RouteDecision[] {
  return decisions.map((decision) => ({
    nodeId: String(decision.nodeId ?? (decision as Record<string, string>).node_id ?? ""),
    selectedEdgeId: String(
      decision.selectedEdgeId ?? (decision as Record<string, string>).selected_edge_id ?? "",
    ),
    selectedTargetNodeId: String(
      decision.selectedTargetNodeId ?? (decision as Record<string, string>).selected_target_node_id ?? "",
    ),
  }));
}

export function buildExecutedPath(
  traces: Record<string, NodeTrace>,
  routeDecisions: RouteDecision[],
  edges: GraphEdge[],
  allNodeIds: string[],
): ExecutedPath {
  const executedNodeIds = new Set(Object.keys(traces));
  const highlightEdgeIds = new Set<string>();
  const dimEdgeIds = new Set<string>();
  const routerDecisionByNode = new Map(routeDecisions.map((decision) => [decision.nodeId, decision]));

  for (const edge of edges) {
    const routerDecision = routerDecisionByNode.get(edge.source);
    if (routerDecision) {
      if (edge.id === routerDecision.selectedEdgeId) {
        highlightEdgeIds.add(edge.id);
      } else if (edge.source === routerDecision.nodeId) {
        dimEdgeIds.add(edge.id);
      }
      continue;
    }

    if (executedNodeIds.has(edge.source) && executedNodeIds.has(edge.target)) {
      highlightEdgeIds.add(edge.id);
    }
  }

  const dimNodeIds = new Set(allNodeIds.filter((nodeId) => !executedNodeIds.has(nodeId)));

  return { executedNodeIds, highlightEdgeIds, dimNodeIds, dimEdgeIds };
}

export function edgeStrokeForInspection(
  edge: Edge,
  path: ExecutedPath | null,
  kind: EdgeKind,
): { stroke: string; strokeWidth: number; opacity?: number } {
  if (!path) {
    return {
      stroke: kind === "conditional" ? color.primary[600] : kind === "default" ? color.warning[600] : color.neutral[400],
      strokeWidth: 1.5,
    };
  }

  if (path.highlightEdgeIds.has(edge.id)) {
    return { stroke: color.success[600], strokeWidth: 3 };
  }

  if (path.dimEdgeIds.has(edge.id)) {
    return { stroke: color.neutral[600], strokeWidth: 1.5, opacity: 0.25 };
  }

  if (path.executedNodeIds.has(edge.source) && path.executedNodeIds.has(edge.target)) {
    return { stroke: color.success[600], strokeWidth: 2.5 };
  }

  return { stroke: color.neutral[500], strokeWidth: 1.5, opacity: 0.35 };
}
