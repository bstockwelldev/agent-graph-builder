import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import { layoutNodesWithDagre } from "./dagreLayout";

// Regression test for "nodes overlap on page load": dagre only guarantees
// non-overlap against the box size it's told each node is, and that size
// previously undershot the real rendered card (components/graph/nodes/
// GraphNodeView.tsx's cardStyle: minWidth 256, height up to ~140 once the
// category/title/summary/status/compile-issue rows are all present). These
// checks lay out nodes with layoutNodesWithDagre, then verify the REAL
// card-sized bounding boxes (not the smaller assumed ones) don't overlap.
const REAL_CARD_WIDTH = 256;
const REAL_CARD_HEIGHT = 140;

function makeNode(id: string): Node {
  return { id, position: { x: 0, y: 0 }, data: {} };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

function overlaps(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  const aLeft = a.x;
  const aRight = a.x + REAL_CARD_WIDTH;
  const aTop = a.y;
  const aBottom = a.y + REAL_CARD_HEIGHT;
  const bLeft = b.x;
  const bRight = b.x + REAL_CARD_WIDTH;
  const bTop = b.y;
  const bBottom = b.y + REAL_CARD_HEIGHT;
  return aLeft < bRight && bLeft < aRight && aTop < bBottom && bTop < aBottom;
}

function assertNoOverlaps(nodes: Node[]) {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      expect(overlaps(nodes[i].position, nodes[j].position)).toBe(false);
    }
  }
}

describe("layoutNodesWithDagre", () => {
  it("returns the input unchanged for an empty node list", () => {
    expect(layoutNodesWithDagre([], [], "LR")).toEqual([]);
  });

  it("leaves no gap between real-sized cards in a linear chain (LR)", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
    const edges = [makeEdge("e1", "a", "b"), makeEdge("e2", "b", "c"), makeEdge("e3", "c", "d")];

    const laidOut = layoutNodesWithDagre(nodes, edges, "LR");

    assertNoOverlaps(laidOut);
  });

  it("leaves no gap between real-sized cards in a linear chain (TB)", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
    const edges = [makeEdge("e1", "a", "b"), makeEdge("e2", "b", "c"), makeEdge("e3", "c", "d")];

    const laidOut = layoutNodesWithDagre(nodes, edges, "TB");

    assertNoOverlaps(laidOut);
  });

  it("leaves no gap between sibling nodes sharing a rank (diamond graph)", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
    const edges = [
      makeEdge("e1", "a", "b"),
      makeEdge("e2", "a", "c"),
      makeEdge("e3", "b", "d"),
      makeEdge("e4", "c", "d"),
    ];

    const laidOut = layoutNodesWithDagre(nodes, edges, "LR");

    assertNoOverlaps(laidOut);
  });

  it("leaves no gap between disconnected nodes (no edges at all)", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];

    const laidOut = layoutNodesWithDagre(nodes, [], "LR");

    assertNoOverlaps(laidOut);
  });
});
