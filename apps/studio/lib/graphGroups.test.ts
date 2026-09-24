import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { GraphGroup } from "@bstockwelldev/agent-graph-sdk";

import {
  COLLAPSED_CARD,
  GROUP_HEADER,
  GROUP_PADDING,
  buildGroupFrameNodes,
  frameNodeId,
  groupBounds,
  groupSelection,
  hideCollapsedMembers,
  pruneGroups,
  rerouteEdgesForCollapsedGroups,
  revealNodeInGroups,
  ungroup,
} from "./graphGroups";

// Wave 7b (STO-611): pure helpers behind visual groups.

const node = (id: string, x: number, y: number, nodeType = "llm") =>
  ({ id, position: { x, y }, measured: { width: 100, height: 50 }, data: { nodeType } }) as unknown as Node<{ nodeType: "llm" }>;
const edge = (id: string, source: string, target: string): Edge => ({ id, source, target, data: { kind: "sequence" } });
const group = (id: string, nodeIds: string[], collapsed = false): GraphGroup => ({ id, label: id, node_ids: nodeIds, collapsed });

describe("groupBounds", () => {
  it("wraps members with padding and a header strip, ignoring non-members", () => {
    const nodes = [node("a", 0, 0), node("b", 200, 100), node("c", 900, 900)];
    expect(groupBounds(group("g", ["a", "b"]), nodes)).toEqual({
      x: -GROUP_PADDING,
      y: -GROUP_PADDING - GROUP_HEADER,
      width: 300 + GROUP_PADDING * 2,
      height: 150 + GROUP_PADDING * 2 + GROUP_HEADER,
    });
    expect(groupBounds(group("g", ["missing"]), nodes)).toBeNull();
  });
});

describe("group membership edits", () => {
  it("groupSelection moves nodes out of other groups and drops emptied groups", () => {
    const start = [group("g1", ["a", "b"]), group("g2", ["c"])];
    const next = groupSelection(start, ["b", "c"], "g3", "New");
    expect(next.map((g) => [g.id, g.node_ids])).toEqual([
      ["g1", ["a"]],
      ["g3", ["b", "c"]],
    ]);
    expect(ungroup(next, "g3").map((g) => g.id)).toEqual(["g1"]);
  });

  it("pruneGroups drops deleted members and empty groups", () => {
    expect(pruneGroups([group("g1", ["a", "x"]), group("g2", ["y"])], ["a", "b"])).toEqual([group("g1", ["a"])]);
  });

  it("revealNodeInGroups expands only the collapsed owner", () => {
    const groups = [group("g1", ["a"], true), group("g2", ["b"], true)];
    const next = revealNodeInGroups(groups, "a");
    expect(next.map((g) => g.collapsed)).toEqual([false, true]);
    expect(revealNodeInGroups(groups, "zzz")).toBe(groups);
  });
});

describe("collapsed groups on the canvas", () => {
  const nodes = [node("in", 0, 0, "input"), node("a", 200, 0), node("b", 400, 0), node("out", 600, 0, "output")];
  const edges = [edge("e1", "in", "a"), edge("e2", "a", "b"), edge("e3", "b", "out"), edge("e4", "in", "b")];

  it("reroutes crossing edges to the card, drops internal ones and merges duplicates", () => {
    const routed = rerouteEdgesForCollapsedGroups(edges, [group("g", ["a", "b"], true)]);
    expect(routed.map((e) => [e.id, e.source, e.target, (e.data as { mergedCount?: number }).mergedCount])).toEqual([
      ["e1", "in", frameNodeId("g"), 2],
      ["e3", frameNodeId("g"), "out", 1],
    ]);
    expect(rerouteEdgesForCollapsedGroups(edges, [group("g", ["a", "b"])])).toBe(edges);
  });

  it("hides collapsed members and renders a compact card", () => {
    const groups = [group("g", ["a", "b"], true)];
    expect(hideCollapsedMembers(nodes, groups).filter((n) => n.hidden).map((n) => n.id)).toEqual(["a", "b"]);
    const [card] = buildGroupFrameNodes(groups, nodes, null);
    expect(card).toMatchObject({ id: "group:g", type: "groupFrame", width: COLLAPSED_CARD.width, zIndex: 0 });
    expect(card.data).toMatchObject({ count: 2, collapsed: true, memberTypes: ["llm", "llm"], dimmed: false });
  });

  it("dims frames with no lit members", () => {
    const [frame] = buildGroupFrameNodes([group("g", ["a", "b"])], nodes, new Set(["in"]));
    expect(frame.data.dimmed).toBe(true);
    expect(frame.zIndex).toBe(-1);
    expect(buildGroupFrameNodes([group("g", ["a", "b"])], nodes, new Set(["a"]))[0].data.dimmed).toBe(false);
  });
});
