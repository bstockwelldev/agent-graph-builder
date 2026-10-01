import type { Node, NodeProps } from "@xyflow/react";
import { CheckCircle2, MessageSquare, Pin } from "lucide-react";
import type { CSSProperties } from "react";
import { NOTE_INK, NOTE_WIDTH, noteColor, relativeTime, type NoteNodeData } from "@/lib/notes";
import { color, fontFamily, radius, spacing } from "@/lib/graph-theme";

/**
 * A sticky note on the canvas: author, age, text, the node it's pinned to
 * and its comment count. Display-only and derived from `notes` (never in
 * `nodes`); selecting one opens the note inspector to edit and comment.
 */
export function StickyNote({ data, selected }: NodeProps<Node<NoteNodeData>>) {
  const { note, pinnedLabel } = data;
  const paper = noteColor(note.color);
  const replies = note.replies?.length ?? 0;
  const text = note.text?.trim() ?? "";
  const author = note.author ?? "Note";
  return (
    <div
      role="group"
      aria-label={`Note by ${author}${text ? `: ${text.slice(0, 80)}` : ""}`}
      style={{
        ...cardStyle,
        background: paper.fill,
        borderColor: selected ? color.primary[700] : paper.edge,
        boxShadow: selected ? `0 0 0 2px ${color.primary[500]}, 0 6px 16px #0006` : "0 6px 16px #0005",
        opacity: note.resolved ? 0.72 : 1,
      }}
    >
      <div style={headerStyle}>
        <span style={{ fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{author}</span>
        <span style={{ opacity: 0.75, whiteSpace: "nowrap" }}>{relativeTime(note.updated_at ?? note.created_at)}</span>
        {note.resolved && (
          <span style={badgeStyle}>
            <CheckCircle2 size={11} aria-hidden="true" /> Resolved
          </span>
        )}
      </div>
      <div style={{ ...bodyStyle, fontStyle: text ? "normal" : "italic", opacity: text ? 1 : 0.65 }}>{text || "Empty note: select it to write"}</div>
      {(pinnedLabel || replies > 0) && (
        <div style={footerStyle}>
          {pinnedLabel && (
            <span style={chipStyle} title={`Pinned to ${pinnedLabel}`}>
              <Pin size={11} aria-hidden="true" /> {pinnedLabel}
            </span>
          )}
          {replies > 0 && (
            <span style={{ ...chipStyle, marginLeft: "auto" }}>
              <MessageSquare size={11} aria-hidden="true" /> {replies} {replies === 1 ? "comment" : "comments"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const cardStyle: CSSProperties = {
  width: NOTE_WIDTH,
  boxSizing: "border-box",
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderRadius: radius.md,
  border: "1px solid",
  color: NOTE_INK,
  fontFamily: fontFamily.ui,
  cursor: "grab",
};
const headerStyle: CSSProperties = { display: "flex", alignItems: "baseline", gap: 6, fontSize: 11, lineHeight: "14px", marginBottom: 4 };
const bodyStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: "17px",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  display: "-webkit-box",
  WebkitLineClamp: 8,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};
const footerStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11 };
const chipStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 999, background: "#0000000f", maxWidth: 140, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
const badgeStyle: CSSProperties = { ...chipStyle, marginLeft: "auto", background: "#0000001a" };
