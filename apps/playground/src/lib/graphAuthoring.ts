import type { Edge, Node } from "@xyflow/react";
import type { GraphNodeData } from "../components/nodes/GraphNodeView";
import type { EdgeKind, GraphOrientation } from "../types";

export type CanvasSnapshot = {
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  graphName: string;
  graphOrientation: GraphOrientation;
};

export function cloneCanvasSnapshot(
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  graphName: string,
  graphOrientation: GraphOrientation,
): CanvasSnapshot {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
      style: node.style ? { ...node.style } : node.style,
    })),
    edges: edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : edge.data,
      style: edge.style ? { ...edge.style } : edge.style,
    })),
    graphName,
    graphOrientation,
  };
}

export function isBlankGraphPattern(nodes: Node<GraphNodeData>[], edges: Edge[]): boolean {
  if (nodes.length !== 2 || edges.length !== 1) return false;
  const input = nodes.find((node) => node.data.nodeType === "input");
  const output = nodes.find((node) => node.data.nodeType === "output");
  if (!input || !output) return false;
  const edge = edges[0];
  const kind = (edge.data?.kind as EdgeKind | undefined) ?? "sequence";
  return edge.source === input.id && edge.target === output.id && kind === "sequence";
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function coachDismissStorageKey(graphId: string): string {
  return `agb-coach-dismissed:${graphId}`;
}

export function isCoachDismissed(graphId: string | null): boolean {
  if (!graphId || typeof window === "undefined") return false;
  return window.localStorage.getItem(coachDismissStorageKey(graphId)) === "1";
}

export function dismissCoach(graphId: string): void {
  window.localStorage.setItem(coachDismissStorageKey(graphId), "1");
}
