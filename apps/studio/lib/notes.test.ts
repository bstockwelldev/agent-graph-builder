import { describe, expect, it } from "vitest";

import { addReply, buildNoteNodes, cacheNoteMeasured, createNote, filterNotes, followPinnedNodes, isNoteNodeId, noteIdFromNode, relativeTime, removeReply, unpinMissing, withNoteMeasured } from "./notes";

const NOW = "2026-10-01T12:00:00.000Z";

describe("sticky notes", () => {
  it("creates notes with fresh ids, the author and an optional pinned node", () => {
    const first = createNote([], { position: { x: 10.4, y: 20.6 }, author: "Ada", now: NOW });
    expect(first).toMatchObject({ id: "note_1", text: "", position: { x: 10, y: 21 }, color: "yellow", author: "Ada", created_at: NOW, node_id: null, resolved: false, replies: [] });
    expect(createNote([first], { position: { x: 0, y: 0 }, author: null, nodeId: "llm_1", now: NOW })).toMatchObject({ id: "note_2", node_id: "llm_1" });
  });

  it("threads comments and removes them", () => {
    const note = createNote([], { position: { x: 0, y: 0 }, author: "Ada", now: NOW });
    const replied = addReply(addReply(note, "  Looks good  ", "Bob", NOW), "Thanks", "Ada", "2026-10-01T13:00:00.000Z");
    expect(replied.replies?.map((reply) => [reply.id, reply.author, reply.text])).toEqual([
      ["reply_1", "Bob", "Looks good"],
      ["reply_2", "Ada", "Thanks"],
    ]);
    expect(replied.updated_at).toBe("2026-10-01T13:00:00.000Z");
    expect(removeReply(replied, "reply_1", NOW).replies?.map((reply) => reply.id)).toEqual(["reply_2"]);
  });

  it("unpins notes whose node is gone, keeping the note", () => {
    const pinned = { ...createNote([], { position: { x: 0, y: 0 }, author: null, nodeId: "gone", now: NOW }) };
    expect(unpinMissing([pinned], ["kept"])[0]).toMatchObject({ id: "note_1", node_id: null });
  });

  it("renders as derived canvas nodes", () => {
    const note = createNote([], { position: { x: 5, y: 6 }, author: "Ada", nodeId: "llm_1", now: NOW });
    const [node] = buildNoteNodes([note], "note_1", (id) => (id === "llm_1" ? "Answer" : null));
    expect(node).toMatchObject({ id: "note:note_1", type: "stickyNote", position: { x: 5, y: 6 }, selected: true, data: { pinnedLabel: "Answer" } });
    expect(isNoteNodeId(node.id)).toBe(true);
    expect(noteIdFromNode(node.id)).toBe("note_1");
  });

  it("shows short relative times", () => {
    const now = Date.parse(NOW);
    expect(relativeTime("2026-10-01T11:59:40.000Z", now)).toBe("just now");
    expect(relativeTime("2026-10-01T11:00:00.000Z", now)).toBe("1h ago");
    expect(relativeTime("2026-09-28T12:00:00.000Z", now)).toBe("3d ago");
    expect(relativeTime(null, now)).toBe("");
  });

  it("moves pinned notes with their node, and leaves the rest", () => {
    const pinned = createNote([], { position: { x: 100, y: 50 }, author: null, nodeId: "llm_1", now: NOW });
    const loose = createNote([pinned], { position: { x: 0, y: 0 }, author: null, now: NOW });
    const notes = [pinned, loose];
    const before = new Map([["llm_1", { x: 10, y: 10 }]]);
    const moved = followPinnedNodes(notes, before, new Map([["llm_1", { x: 40, y: -5 }]]));
    expect(moved.map((note) => note.position)).toEqual([{ x: 130, y: 35 }, { x: 0, y: 0 }]);
    // Nothing moved: the same array, so no re-render.
    expect(followPinnedNodes(notes, before, new Map(before))).toBe(notes);
  });

  it("filters open and resolved notes, newest first", () => {
    const a = { ...createNote([], { position: { x: 0, y: 0 }, author: null, now: "2026-10-01T10:00:00.000Z" }) };
    const b = { ...createNote([a], { position: { x: 0, y: 0 }, author: null, now: "2026-10-01T11:00:00.000Z" }), resolved: true };
    const c = createNote([a, b], { position: { x: 0, y: 0 }, author: null, now: "2026-10-01T12:00:00.000Z" });
    expect(filterNotes([a, b, c], "open").map((note) => note.id)).toEqual([c.id, a.id]);
    expect(filterNotes([a, b, c], "resolved").map((note) => note.id)).toEqual([b.id]);
    expect(filterNotes([a, b, c], "all")).toHaveLength(3);
  });

  // STO-630: measured dimensions are cached runtime-only so drag rebuilds
  // don't render derived note nodes unmeasured (React Flow hides those).
  it("caches note measured dimensions, returning the map unchanged when nothing new", () => {
    const empty = new Map();
    expect(cacheNoteMeasured(empty, "note_1", undefined)).toBe(empty);
    expect(cacheNoteMeasured(empty, "note_1", { width: 200 })).toBe(empty);
    const cached = cacheNoteMeasured(empty, "note_1", { width: 200, height: 120 });
    expect(cached.get("note_1")).toEqual({ width: 200, height: 120 });
    // Same dims: same map, so no re-render.
    expect(cacheNoteMeasured(cached, "note_1", { width: 200, height: 120 })).toBe(cached);
    // New dims: new map with both entries.
    const updated = cacheNoteMeasured(cached, "note_2", { width: 200, height: 90 });
    expect(updated.get("note_1")).toEqual({ width: 200, height: 120 });
    expect(updated.get("note_2")).toEqual({ width: 200, height: 90 });
  });

  it("re-attaches cached measured dimensions to derived note nodes", () => {
    const note = createNote([], { position: { x: 5, y: 6 }, author: "Ada", now: NOW });
    const [node] = buildNoteNodes([note], null, () => null);
    // No cache: nodes pass through untouched.
    expect(withNoteMeasured([node], new Map())[0]).toBe(node);
    expect("measured" in node).toBe(false);
    // Cached: measured dims are attached without touching anything else.
    const [measured] = withNoteMeasured([node], new Map([["note_1", { width: 200, height: 120 }]]));
    expect(measured).toMatchObject({ id: "note:note_1", measured: { width: 200, height: 120 }, position: { x: 5, y: 6 } });
    // Unknown note id: left alone.
    const [other] = withNoteMeasured([node], new Map([["note_9", { width: 200, height: 120 }]]));
    expect("measured" in other).toBe(false);
  });
});
