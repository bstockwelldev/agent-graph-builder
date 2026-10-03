"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquare, Pin, Plus, StickyNote } from "lucide-react";
import type { GraphNote } from "@bstockwelldev/agent-graph-sdk";
import { NOTE_INK, filterNotes, noteColor, relativeTime, type NotesFilter } from "@/lib/notes";
import { border, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Toggle } from "./ui/Toggle";

/**
 * Every sticky note on the graph (Notes panel): filter by open or resolved,
 * open one on the canvas, show or hide notes, add one.
 */
export function NotesPanel({
  notes,
  nodeLabel,
  showNotes,
  onShowNotesChange,
  onOpen,
  onAdd,
}: {
  notes: GraphNote[];
  nodeLabel: (nodeId: string) => string | null;
  showNotes: boolean;
  onShowNotesChange: (show: boolean) => void;
  onOpen: (noteId: string) => void;
  onAdd: () => void;
}) {
  const [filter, setFilter] = useState<NotesFilter>("open");
  const open = notes.filter((note) => !note.resolved).length;
  const shown = filterNotes(notes, filter);
  return (
    <div style={{ padding: spacing[3], display: "flex", flexDirection: "column", gap: spacing[3] }}>
      <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
        <div style={{ flex: 1 }}>
          <Toggle checked={showNotes} onChange={onShowNotesChange} label="Show notes on canvas" />
        </div>
        <Button variant="secondary" onClick={onAdd} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Plus size={14} aria-hidden="true" /> Add
        </Button>
      </div>
      <SegmentedControl
        aria-label="Which notes"
        value={filter}
        options={[
          { value: "open", label: `Open (${open})` },
          { value: "resolved", label: `Resolved (${notes.length - open})` },
          { value: "all", label: `All (${notes.length})` },
        ]}
        onChange={setFilter}
      />
      {shown.length === 0 ? (
        <p role="status" style={{ ...typeScale.caption, color: text.secondary, margin: 0 }}>
          {notes.length === 0 ? "No notes yet. Right-click the canvas or a node to add one." : filter === "open" ? "No open notes." : "No resolved notes."}
        </p>
      ) : (
        <ul aria-label="Notes" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: spacing[2] }}>
          {shown.map((note) => {
            const paper = noteColor(note.color);
            const pinned = note.node_id ? nodeLabel(note.node_id) : null;
            const replies = note.replies?.length ?? 0;
            const preview = note.text?.trim() || "Empty note";
            return (
              <li key={note.id}>
                <button
                  type="button"
                  className="agb-focus-ring agb-hoverable"
                  aria-label={`Open note by ${note.author ?? "unknown author"}: ${preview.slice(0, 60)}`}
                  onClick={() => onOpen(note.id)}
                  style={{ display: "flex", gap: spacing[2], width: "100%", textAlign: "left", padding: spacing[2], borderRadius: radius.md, border: `1px solid ${border.subtle}`, background: surface.card, color: text.primary, cursor: "pointer" }}
                >
                  <span aria-hidden="true" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: radius.sm, background: paper.fill, color: NOTE_INK }}>
                    <StickyNote size={13} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", gap: 6, ...typeScale.caption, color: text.secondary }}>
                      <strong style={{ color: text.primary }}>{note.author ?? "Unknown author"}</strong>
                      <span>{relativeTime(note.updated_at ?? note.created_at)}</span>
                      {note.resolved && (
                        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <CheckCircle2 size={11} aria-hidden="true" /> Resolved
                        </span>
                      )}
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</span>
                    {(pinned || replies > 0) && (
                      <span style={{ display: "flex", gap: spacing[2], ...typeScale.caption, color: text.secondary, marginTop: 2 }}>
                        {pinned && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <Pin size={11} aria-hidden="true" /> {pinned}
                          </span>
                        )}
                        {replies > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <MessageSquare size={11} aria-hidden="true" /> {replies}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
