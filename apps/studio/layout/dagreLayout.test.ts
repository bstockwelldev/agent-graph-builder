import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import { findFreePosition, inferRankDir, layoutNodesWithDagre, needsInitialLayout } from "./dagreLayout";
import { boxesOverlap, nodeBoxAt, NODE_CARD_MAX_HEIGHT, NODE_CARD_WIDTH } from "./nodeGeometry";

// Regression test for "nodes overlap on page load": dagre only guarantees
// non-overlap against the box size it's told each node is, and that size
// previously undershot the real rendered card (components/graph/nodes/
// GraphNodeView.tsx's cardStyle: minWidth 256, height up to ~140 once the
// category/title/summary/status/compile-issue rows are all present). These
// checks lay out nodes with layoutNodesWithDagre, then verify the REAL
// card-sized bounding boxes (not the smaller assumed ones) don't overlap.
// Since studio-graph-workbench-redesign-plan.md Slice 5 the card's bounds
// ARE these shared constants (GraphNodeView enforces them), not an estimate.
const REAL_CARD_WIDTH = NODE_CARD_WIDTH;
const REAL_CARD_HEIGHT = NODE_CARD_MAX_HEIGHT;

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

describe("spacing presets", () => {
  it("still never overlaps real cards at the tightest preset", () => {
    const nodes = ["a", "b", "c", "d", "e"].map(makeNode);
    const edges = [makeEdge("e1", "a", "b"), makeEdge("e2", "a", "c"), makeEdge("e3", "a", "d"), makeEdge("e4", "b", "e")];
    assertNoOverlaps(layoutNodesWithDagre(nodes, edges, "LR", "compact"));
    assertNoOverlaps(layoutNodesWithDagre(nodes, edges, "TB", "compact"));
  });

  it("spreads ranks further apart as spacing relaxes", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("e1", "a", "b")];
    const gap = (spacing: "compact" | "standard" | "relaxed") => {
      const [a, b] = layoutNodesWithDagre(nodes, edges, "LR", spacing);
      return b.position.x - a.position.x;
    };
    expect(gap("compact")).toBeLessThan(gap("standard"));
    expect(gap("standard")).toBeLessThan(gap("relaxed"));
  });
});

describe("needsInitialLayout (keep saved positions on load)", () => {
  const at = (x: number, y: number) => ({ position: { x, y } });

  it("is false for an empty graph and for non-overlapping saved positions", () => {
    expect(needsInitialLayout([])).toBe(false);
    expect(needsInitialLayout([at(0, 0), at(400, 0), at(800, 200)])).toBe(false);
  });

  it("is true when every node sits at the origin (no saved layout)", () => {
    expect(needsInitialLayout([at(0, 0), at(0, 0)])).toBe(true);
    expect(needsInitialLayout([at(0, 0)])).toBe(true);
  });

  it("is true when any two cards overlap", () => {
    expect(needsInitialLayout([at(0, 0), at(100, 40), at(900, 0)])).toBe(true);
  });

  it("is true when saved positions run along the other axis than the effective direction", () => {
    const horizontal = [at(0, 0), at(400, 0), at(800, 0)];
    expect(inferRankDir(horizontal)).toBe("LR");
    expect(needsInitialLayout(horizontal, "LR")).toBe(false);
    expect(needsInitialLayout(horizontal, "TB")).toBe(true);
  });
});

describe("findFreePosition (new-node placement)", () => {
  it("returns the preferred point when it's free", () => {
    expect(findFreePosition([{ position: { x: 1000, y: 1000 } }], { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("steps to a non-overlapping spot when the preferred point is taken", () => {
    const existing = [{ position: { x: 0, y: 0 } }, { position: { x: 0, y: 160 } }];
    const placed = findFreePosition(existing, { x: 10, y: 10 });
    for (const node of existing) {
      expect(boxesOverlap(nodeBoxAt(placed), nodeBoxAt(node.position))).toBe(false);
    }
  });
});
