import dagre from "@dagrejs/dagre";
import { Position } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import type { GraphOrientation } from "@bstockwelldev/agent-graph-sdk";
import { boxesOverlap, nodeBoxAt, NODE_CARD_MAX_HEIGHT, NODE_CARD_WIDTH } from "./nodeGeometry";

export type LayoutRankDir = "LR" | "TB";

/** Spacing preset from the header's Layout menu (studio-graph-workbench-redesign-plan.md, Slice 3). */
export type LayoutSpacing = "compact" | "standard" | "relaxed";

export const LAYOUT_SPACING: Record<LayoutSpacing, { nodesep: number; ranksep: number }> = {
  compact: { nodesep: 28, ranksep: 48 },
  standard: { nodesep: 48, ranksep: 72 },
  relaxed: { nodesep: 72, ranksep: 112 },
};

// Dagre only guarantees non-overlap against the box size it's given here,
// so it must equal the real card's bounds -- both come from
// layout/nodeGeometry.ts, which GraphNodeView enforces (fixed width,
// bounded height). A previous hardcoded 180x72 (then 280x160) drifted from
// the card and nodes overlapped on page load.
const NODE_WIDTH = NODE_CARD_WIDTH;
const NODE_HEIGHT = NODE_CARD_MAX_HEIGHT;
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
  spacing: LayoutSpacing = "standard",
): Node<T>[] {
  if (nodes.length === 0) return nodes;

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: rankDir, ...LAYOUT_SPACING[spacing], marginx: 24, marginy: 24 });

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

/**
 * Whether a freshly loaded graph needs an automatic layout pass
 * (studio-graph-workbench-redesign-plan.md, Slice 5). Dagre used to run on
 * every graph load, discarding the positions the user saved; now it only
 * runs when the saved positions can't be trusted: every node at the
 * origin (a graph created via the API without positions), or any two card
 * boxes overlapping.
 */
export function needsInitialLayout(nodes: Pick<Node, "position">[], rankDir?: LayoutRankDir): boolean {
  if (nodes.length === 0) return false;
  // Saved positions laid out along the other axis (e.g. a graph arranged
  // left-to-right on desktop, opened on a portrait phone where "auto"
  // resolves to top-to-bottom) are re-laid-out rather than shown tiny.
  if (rankDir && nodes.length > 1 && inferRankDir(nodes) !== rankDir) return true;
  if (nodes.every((node) => node.position.x === 0 && node.position.y === 0)) return true;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (boxesOverlap(nodeBoxAt(nodes[i].position), nodeBoxAt(nodes[j].position))) return true;
    }
  }
  return false;
}

/**
 * First position at or near `preferred` where a new card doesn't overlap
 * any existing one, stepping down (then right, in columns) from the
 * preferred point. Replaces the random placement new nodes used to get.
 */
export function findFreePosition(
  existing: Pick<Node, "position">[],
  preferred: { x: number; y: number },
  gap = 24,
): { x: number; y: number } {
  const stepY = NODE_HEIGHT + gap;
  const stepX = NODE_WIDTH + gap;
  for (let column = 0; column < 8; column += 1) {
    for (let row = 0; row < 12; row += 1) {
      const candidate = { x: preferred.x + column * stepX, y: preferred.y + row * stepY };
      const box = nodeBoxAt(candidate);
      if (!existing.some((node) => boxesOverlap(box, nodeBoxAt(node.position), gap / 2))) return candidate;
    }
  }
  return preferred;
}

/** The direction saved positions are arranged along: wider than tall → LR. */
export function inferRankDir(nodes: Pick<Node, "position">[]): LayoutRankDir {
  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const width = Math.max(...xs) - Math.min(...xs) + NODE_WIDTH;
  const height = Math.max(...ys) - Math.min(...ys) + NODE_HEIGHT;
  return width >= height ? "LR" : "TB";
}
