"use client";

import { useState } from "react";
import { CheckCircle2, MessageSquare, Pin, StickyNote, Trash2, X } from "lucide-react";
import type { GraphNote } from "@bstockwelldev/agent-graph-sdk";
import { NOTE_COLORS, noteColor, relativeTime } from "@/lib/notes";
import { border, color, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { Combobox } from "./ui/Combobox";
import { Field } from "./ui/Field";
import { Group } from "./ui/Group";
import { IconButton } from "./ui/IconButton";
import { PanelFrame, PanelHeader } from "./ui/PanelFrame";
import { SegmentedControl } from "./ui/SegmentedControl";
import { TextArea, TextInput } from "./ui/fields";
import { Toggle } from "./ui/Toggle";

export type NoteAuthor = { name: string | null; signedIn: boolean; setName: (name: string) => void };

/**
 * A selected sticky note: its text, color, the node it's pinned to, and its
 * comment thread. Notes are display-only; edits are undoable and saved with
 * the graph like any other canvas change.
 */
export function NoteInspector({
  note,
  nodeOptions,
  author,
  onChange,
  onReply,
  onDeleteReply,
  onDelete,
  onShowNode,
}: {
  note: GraphNote;
  /** Nodes it can be pinned to. */
  nodeOptions: { value: string; label: string }[];
  author: NoteAuthor;
  onChange: (patch: Partial<GraphNote>) => void;
  onReply: (text: string) => void;
  onDeleteReply: (replyId: string) => void;
  onDelete: () => void;
  onShowNode: (nodeId: string) => void;
}) {
  const [reply, setReply] = useState("");
  const replies = note.replies ?? [];
  const paper = noteColor(note.color);
  const submitReply = () => {
    if (!reply.trim()) return;
    onReply(reply);
    setReply("");
  };
  return (
    <PanelFrame
      aria-label="Note details"
      header={
        <PanelHeader
          helpArticleId="sticky-notes"
          icon={
            <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: radius.lg, background: paper.fill, color: "#1f2329" }}>
              <StickyNote size={18} />
            </span>
          }
          title="Note"
          subtitle={
            <span>
              {note.author ?? "Unknown author"}
              {note.created_at ? ` · ${relativeTime(note.created_at)}` : ""}
              {note.resolved ? " · Resolved" : ""}
            </span>
          }
          actions={<IconButton label="Delete note" tone="destructive" icon={<Trash2 size={15} />} onClick={onDelete} tooltipPlacement="bottom" />}
        />
      }
    >
      <Group>
        <Field label="Note">
          {(id) => (
            <TextArea
              id={id}
              aria-label="Note text"
              value={note.text ?? ""}
              rows={5}
              placeholder="What should others know about this part of the graph?"
              onChange={(event) => onChange({ text: event.target.value, updated_at: new Date().toISOString() })}
            />
          )}
        </Field>
        <Field label="Color">
          <SegmentedControl
            aria-label="Note color"
            value={paper.value}
            options={NOTE_COLORS.map((option) => ({
              value: option.value,
              title: option.label,
              label: (
                <>
                  <span aria-hidden style={{ width: 12, height: 12, borderRadius: "50%", background: option.fill, border: `1px solid ${option.edge}`, display: "inline-block" }} />
                  <span className="sr-only">{option.label}</span>
                </>
              ),
            }))}
            onChange={(value) => onChange({ color: value })}
          />
        </Field>
        <Field label="Pinned to" hint="Pinning names the node this note is about; the note keeps its own place on the canvas.">
          {(id) => (
            <div style={{ display: "flex", gap: spacing[1], alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Combobox
                  id={id}
                  aria-label="Pinned to node"
                  value={note.node_id ?? ""}
                  options={[{ value: "", label: "Not pinned" }, ...nodeOptions]}
                  onChange={(value) => onChange({ node_id: value || null })}
                />
              </div>
              {note.node_id && <IconButton label="Show pinned node" icon={<Pin size={14} />} onClick={() => onShowNode(note.node_id!)} />}
            </div>
          )}
        </Field>
        <Toggle checked={Boolean(note.resolved)} onChange={(resolved) => onChange({ resolved })} label="Resolved" />
      </Group>

      <Group title={`Comments${replies.length ? ` (${replies.length})` : ""}`} icon={<MessageSquare size={13} />}>
        {replies.length === 0 ? (
          <p style={{ ...typeScale.caption, color: text.secondary, margin: `0 0 ${spacing[2]}px` }}>No comments yet.</p>
        ) : (
          <ol aria-label="Comments" style={{ listStyle: "none", margin: `0 0 ${spacing[2]}px`, padding: 0, display: "flex", flexDirection: "column", gap: spacing[2] }}>
            {replies.map((entry) => (
              <li key={entry.id} style={{ padding: spacing[2], borderRadius: radius.md, background: surface.inset, border: `1px solid ${border.subtle}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, ...typeScale.caption, color: text.secondary }}>
                  <strong style={{ color: text.primary }}>{entry.author ?? "Unknown author"}</strong>
                  <span>{relativeTime(entry.created_at)}</span>
                  <span style={{ marginLeft: "auto" }}>
                    <IconButton label={`Delete comment by ${entry.author ?? "unknown author"}`} icon={<X size={12} />} onClick={() => onDeleteReply(entry.id)} />
                  </span>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: "18px", color: text.primary, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 2 }}>{entry.text}</div>
              </li>
            ))}
          </ol>
        )}
        {!author.signedIn && (
          <Field label="Your name" hint="Shown on notes and comments you write. Saved in this browser.">
            {(id) => <TextInput id={id} aria-label="Your name" value={author.name ?? ""} placeholder="e.g. Ada" onChange={(event) => author.setName(event.target.value)} />}
          </Field>
        )}
        <Field label="Add a comment">
          {(id) => (
            <TextArea
              id={id}
              aria-label="Add a comment"
              value={reply}
              rows={2}
              placeholder="Reply to this note (⌘↵ to post)"
              onChange={(event) => setReply(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submitReply();
                }
              }}
            />
          )}
        </Field>
        <div style={{ display: "flex", gap: spacing[2], alignItems: "center" }}>
          <Button variant="primary" disabled={!reply.trim()} onClick={submitReply}>
            Comment
          </Button>
          {!note.resolved && replies.length > 0 && (
            <Button variant="ghost" onClick={() => onChange({ resolved: true })} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <CheckCircle2 size={14} aria-hidden="true" style={{ color: color.success[500] }} /> Resolve
            </Button>
          )}
        </div>
      </Group>
    </PanelFrame>
  );
}
