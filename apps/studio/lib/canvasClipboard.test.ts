import { describe, expect, it } from "vitest";

import { copyNodes, freshId, pasteNodes } from "./canvasClipboard";

const nodes = [
  { id: "a", type: "llm", position: { x: 100, y: 100 }, data: { label: "A" } },
  { id: "b", type: "tool", position: { x: 300, y: 160 }, data: { label: "B" } },
  {
    id: "c",
    type: "output",
    position: { x: 500, y: 100 },
    data: { label: "C" },
  },
];
const edges = [
  { id: "e1", source: "a", target: "b" },
  { id: "e2", source: "b", target: "c" },
];

function counter() {
  let n = 0;
  return (prefix: string) => `${prefix}_${++n}`;
}

describe("copyNodes", () => {
  it("copies the picked nodes and only the edges between them", () => {
    const clip = copyNodes(nodes, edges, ["a", "b"])!;
    expect(clip.nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(clip.edges.map((edge) => edge.id)).toEqual(["e1"]);
    // A deep copy: later edits to the canvas don't change the clipboard.
    expect(clip.nodes[0].data).not.toBe(nodes[0].data);
  });

  it("returns null when nothing matches", () => {
    expect(copyNodes(nodes, edges, ["zzz"])).toBeNull();
  });
});

describe("pasteNodes", () => {
  it("pastes with fresh ids, rewired edges and the nodes selected", () => {
    const clip = copyNodes(nodes, edges, ["a", "b"])!;
    const pasted = pasteNodes(clip, ["a", "b", "c", "llm_1"], counter());
    expect(pasted.nodes.map((node) => node.id)).toEqual(["llm_2", "tool_3"]);
    expect(pasted.nodes.every((node) => node.selected)).toBe(true);
    expect(pasted.edges).toEqual([
      { id: "e_4", source: "llm_2", target: "tool_3", selected: false },
    ]);
    // Default offset: 40px down and right.
    expect(pasted.nodes[0].position).toEqual({ x: 140, y: 140 });
  });

  it("moves the pasted group's top-left corner to the given point", () => {
    const clip = copyNodes(nodes, edges, ["a", "b"])!;
    const pasted = pasteNodes(clip, [], counter(), { x: 0, y: 0 });
    expect(pasted.nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 60 },
    ]);
  });
});

describe("freshId", () => {
  it("skips ids already taken", () => {
    const taken = new Set(["llm_1", "llm_2"]);
    expect(freshId("llm", taken, counter())).toBe("llm_3");
    expect(taken.has("llm_3")).toBe(true);
  });
});
