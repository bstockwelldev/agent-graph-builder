import type { GraphNote, GraphNoteReply } from "@bstockwelldev/agent-graph-sdk";

// Sticky notes on the canvas: reference notes and comment threads between
// authors. Saved with the graph (GraphDefinition.notes) but display-only:
// the semantic fingerprint, releases' diffs, the compiler and the runtime
// all ignore them. They render as derived React Flow nodes (`note:<id>`),
// like group frames, so dragging one updates `notes`, never `nodes`.

export type NoteColor = "yellow" | "blue" | "green" | "pink" | "violet";

/** Pale paper fills with dark ink: each keeps 7:1+ text contrast. */
export const NOTE_COLORS: { value: NoteColor; label: string; fill: string; edge: string }[] = [
  { value: "yellow", label: "Yellow", fill: "#fbefa6", edge: "#d9c45a" },
  { value: "blue", label: "Blue", fill: "#cfe3fb", edge: "#86afe0" },
  { value: "green", label: "Green", fill: "#d3f0d5", edge: "#86c78d" },
  { value: "pink", label: "Pink", fill: "#f8d5e6", edge: "#d991b5" },
  { value: "violet", label: "Violet", fill: "#e3dafb", edge: "#a996e0" },
];
export const NOTE_INK = "#1f2329";
export const NOTE_WIDTH = 220;

const NOTE_PREFIX = "note:";
export const noteNodeId = (id: string) => `${NOTE_PREFIX}${id}`;
export const isNoteNodeId = (id: string) => id.startsWith(NOTE_PREFIX);
export const noteIdFromNode = (nodeId: string) => nodeId.slice(NOTE_PREFIX.length);

export function noteColor(color: string | null | undefined) {
  return NOTE_COLORS.find((option) => option.value === color) ?? NOTE_COLORS[0];
}

function newId(prefix: string, taken: Set<string>): string {
  for (let index = 1; ; index++) {
    const id = `${prefix}_${index}`;
    if (!taken.has(id)) return id;
  }
}

export function createNote(
  notes: GraphNote[],
  options: { position: { x: number; y: number }; author: string | null; nodeId?: string | null; now?: string },
): GraphNote {
  const now = options.now ?? new Date().toISOString();
  return {
    id: newId("note", new Set(notes.map((note) => note.id))),
    text: "",
    position: { x: Math.round(options.position.x), y: Math.round(options.position.y) },
    color: "yellow",
    author: options.author,
    created_at: now,
    updated_at: now,
    node_id: options.nodeId ?? null,
    resolved: false,
    replies: [],
  };
}

export function addReply(note: GraphNote, text: string, author: string | null, now = new Date().toISOString()): GraphNote {
  const replies = note.replies ?? [];
  const reply: GraphNoteReply = { id: newId("reply", new Set(replies.map((r) => r.id))), text: text.trim(), author, created_at: now };
  return { ...note, replies: [...replies, reply], updated_at: now };
}

export function removeReply(note: GraphNote, replyId: string, now = new Date().toISOString()): GraphNote {
  return { ...note, replies: (note.replies ?? []).filter((reply) => reply.id !== replyId), updated_at: now };
}

/** Notes pinned to a node that no longer exists keep their text and comments, unpinned. */
export function unpinMissing(notes: GraphNote[], nodeIds: Iterable<string>): GraphNote[] {
  const present = new Set(nodeIds);
  return notes.map((note) => (note.node_id && !present.has(note.node_id) ? { ...note, node_id: null } : note));
}

export type NoteNodeData = {
  note: GraphNote;
  /** The pinned node's display name, when pinned. */
  pinnedLabel: string | null;
};

/** React Flow nodes for the notes, drawn above the graph (zIndex) and never connectable. */
export function buildNoteNodes(notes: GraphNote[], selectedNoteId: string | null, labelFor: (nodeId: string) => string | null) {
  return notes.map((note) => ({
    id: noteNodeId(note.id),
    type: "stickyNote",
    position: { x: note.position?.x ?? 0, y: note.position?.y ?? 0 },
    data: { note, pinnedLabel: note.node_id ? labelFor(note.node_id) : null } satisfies NoteNodeData,
    selected: note.id === selectedNoteId,
    connectable: false,
    zIndex: 5,
    style: { width: NOTE_WIDTH },
  }));
}

export type NoteMeasured = ReadonlyMap<string, { width: number; height: number }>;

/**
 * STO-630: cache a note's measured dimensions from a React Flow `dimensions`
 * change. Runtime-only (never persisted, never undoable): without it, every
 * drag rebuilds the derived note node unmeasured and React Flow hides it
 * (`visibility: hidden`) until re-measured, so the note flickers mid-drag.
 * Returns the input map unchanged when there is nothing new to store.
 */
export function cacheNoteMeasured(current: NoteMeasured, noteId: string, dimensions: { width?: number; height?: number } | undefined): NoteMeasured {
  const width = dimensions?.width;
  const height = dimensions?.height;
  if (typeof width !== "number" || typeof height !== "number") return current;
  const prev = current.get(noteId);
  if (prev && prev.width === width && prev.height === height) return current;
  return new Map(current).set(noteId, { width, height });
}

/**
 * STO-630: re-attach cached measured dimensions to derived note nodes so a
 * drag (which rebuilds them every frame) doesn't render them unmeasured.
 */
export function withNoteMeasured<T extends { id: string }>(noteNodes: T[], measured: NoteMeasured): T[] {
  if (measured.size === 0) return noteNodes;
  return noteNodes.map((node) => {
    const dims = measured.get(noteIdFromNode(node.id));
    return dims ? { ...node, measured: dims } : node;
  });
}

/** Short relative time for note headers ("just now", "5m", "3h", "2d", else the date). */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}

/**
 * Pinned notes keep their place relative to their node: each moves by its
 * node's change in position between `previous` and `current`. Returns the
 * same array when nothing moved, so callers can skip a re-render.
 */
export function followPinnedNodes(
  notes: GraphNote[],
  previous: ReadonlyMap<string, { x: number; y: number }>,
  current: ReadonlyMap<string, { x: number; y: number }>,
): GraphNote[] {
  let changed = false;
  const next = notes.map((note) => {
    if (!note.node_id) return note;
    const before = previous.get(note.node_id);
    const after = current.get(note.node_id);
    if (!before || !after || (before.x === after.x && before.y === after.y)) return note;
    changed = true;
    const position = note.position ?? { x: 0, y: 0 };
    return { ...note, position: { x: Math.round(position.x + after.x - before.x), y: Math.round(position.y + after.y - before.y) } };
  });
  return changed ? next : notes;
}

export type NotesFilter = "open" | "resolved" | "all";

export function filterNotes(notes: GraphNote[], filter: NotesFilter): GraphNote[] {
  const shown = filter === "all" ? notes : notes.filter((note) => Boolean(note.resolved) === (filter === "resolved"));
  // Newest activity first.
  return [...shown].sort((a, b) => (b.updated_at ?? b.created_at ?? "").localeCompare(a.updated_at ?? a.created_at ?? ""));
}
