import dagre from "@dagrejs/dagre";
import { Position } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import type { GraphOrientation } from "../types";

export type LayoutRankDir = "LR" | "TB";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 72;
const NARROW_PANE_WIDTH = 420;

export function computeEffectiveRankDir(
  paneWidth: number,
  paneHeight: number,
  orientationPin: GraphOrientation,
): LayoutRankDir {
  if (orientationPin === "horizontal") return "LR";
  if (orientationPin === "vertical") return "TB";
  if (paneWidth < NARROW_PANE_WIDTH || paneHeight > paneWidth) return "TB";
  return "LR";
}

export function handlesForRankDir(rankDir: LayoutRankDir): {
  source: Position;
  target: Position;
} {
  if (rankDir === "TB") {
    return { source: Position.Bottom, target: Position.Top };
  }
  return { source: Position.Right, target: Position.Left };
}

export function layoutNodesWithDagre<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  rankDir: LayoutRankDir,
): Node<T>[] {
  if (nodes.length === 0) return nodes;

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: rankDir, nodesep: 48, ranksep: 72, marginx: 24, marginy: 24 });

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const { source, target } = handlesForRankDir(rankDir);

  return nodes.map((node) => {
    const layoutNode = graph.node(node.id);
    if (!layoutNode) return node;
    return {
      ...node,
      position: {
        x: layoutNode.x - NODE_WIDTH / 2,
        y: layoutNode.y - NODE_HEIGHT / 2,
      },
      sourcePosition: source,
      targetPosition: target,
    };
  });
}

export function layoutLabelForRankDir(rankDir: LayoutRankDir): string {
  return rankDir === "TB" ? "vertical" : "horizontal";
}
