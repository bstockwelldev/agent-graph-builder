import dagre from "@dagrejs/dagre";
import { Position } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import type { GraphOrientation } from "@bstockwelldev/agent-graph-sdk";

export type LayoutRankDir = "LR" | "TB";

// Must safely cover the largest rendered node card
// (components/graph/nodes/GraphNodeView.tsx's cardStyle: minWidth 256, and
// height that grows with category/title/summary/status/compile-issue rows,
// up to ~140px). Dagre only guarantees non-overlap against the box size it
// was given here -- these previously undershot the real card (180x72),
// so ranksep/nodesep computed a gap too small for the actual rendered
// cards, and adjacent nodes visually overlapped on every layout run,
// including the very first one on page load.
const NODE_WIDTH = 280;
const NODE_HEIGHT = 160;
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
