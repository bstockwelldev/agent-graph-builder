import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import type { GroupFrameData } from "@/lib/graphGroups";
import { nodeType as nodeTypeColors, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { useCanvasActions } from "../canvasActions";
import { NODE_TYPE_ICONS } from "../nodeTypeIcons";

/**
 * Visual group frame (large-graph complexity, Wave 7b / STO-611).
 *
 * Expanded: a tinted rectangle behind the group's members. Only its header
 * strip takes pointer events (drag the header to move the whole group), so
 * panning and box-selecting inside the frame still work.
 *
 * Collapsed: a compact card standing in for the members -- label, "N
 * nodes", and a strip of member-type icons. Edges crossing the group
 * boundary attach to its handles; double-click expands it.
 */
export function GroupFrame({ data }: NodeProps<Node<GroupFrameData>>) {
  const actions = useCanvasActions();
  const { groupId, label, color, count, collapsed, memberTypes, dimmed, horizontal, renaming } = data;
  const toggleLabel = collapsed ? `Expand group ${label}` : `Collapse group ${label}`;

  const header = (
    <div className="agb-group-handle" style={{ ...headerStyle, pointerEvents: "all" }}>
      <button
        type="button"
        className="nodrag agb-focus-ring agb-hoverable"
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        title={toggleLabel}
        style={toggleStyle}
        onClick={(event) => {
          event.stopPropagation();
          actions.toggleGroup(groupId);
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      {renaming ? (
        <RenameInput label={label} onCommit={(next) => actions.renameGroup(groupId, next)} />
      ) : (
        <span style={{ ...typeScale.caption, fontWeight: 600, color: text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
      )}
      <span style={{ ...typeScale.caption, color: text.secondary, marginLeft: "auto", whiteSpace: "nowrap" }}>
        {count} node{count === 1 ? "" : "s"}
      </span>
    </div>
  );

  if (!collapsed) {
    return (
      <div
        role="group"
        aria-label={`Group ${label}`}
        data-testid={`group-frame-${groupId}`}
        style={{
          ...frameStyle,
          borderColor: color,
          background: `${color}1f`,
          opacity: dimmed ? 0.3 : 1,
        }}
      >
        {header}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={`Group ${label} (collapsed)`}
      data-testid={`group-card-${groupId}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        actions.toggleGroup(groupId);
      }}
      style={{ ...cardStyle, borderColor: color, opacity: dimmed ? 0.3 : 1 }}
    >
      <Handle type="target" position={horizontal ? Position.Left : Position.Top} isConnectable={false} style={handleStyle} />
      {header}
      <div style={{ display: "flex", gap: 4, padding: `0 ${spacing[2]}px ${spacing[2]}px`, flexWrap: "wrap" }} aria-hidden="true">
        {memberTypes.slice(0, 10).map((type, index) => {
          const Icon = NODE_TYPE_ICONS[type];
          const tone = nodeTypeColors[type as keyof typeof nodeTypeColors];
          return (
            <span key={`${type}-${index}`} style={{ ...chipStyle, color: tone?.accent ?? text.secondary, borderColor: tone?.border ?? surface.borderStrong }}>
              {Icon ? <Icon size={12} /> : null}
            </span>
          );
        })}
        {memberTypes.length > 10 && <span style={{ ...typeScale.caption, color: text.secondary }}>+{memberTypes.length - 10}</span>}
      </div>
      <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} isConnectable={false} style={handleStyle} />
    </div>
  );
}

function RenameInput({ label, onCommit }: { label: string; onCommit: (label: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      aria-label="Group name"
      defaultValue={label}
      className="nodrag agb-focus-ring"
      style={inputStyle}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") onCommit(event.currentTarget.value);
        if (event.key === "Escape") onCommit(null);
      }}
      onBlur={(event) => onCommit(event.currentTarget.value)}
    />
  );
}

const frameStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.xl,
  borderWidth: 2,
  borderStyle: "dashed",
  boxSizing: "border-box",
  pointerEvents: "none",
};
const cardStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: radius.lg,
  borderWidth: 1.5,
  borderStyle: "solid",
  background: surface.card,
  boxSizing: "border-box",
  boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
  cursor: "grab",
};
const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[1],
  height: 32,
  padding: `0 ${spacing[2]}px 0 ${spacing[1]}px`,
  cursor: "grab",
};
const toggleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  border: "none",
  borderRadius: radius.md,
  background: "none",
  color: text.secondary,
  cursor: "pointer",
  flexShrink: 0,
};
const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 20,
  borderRadius: radius.md,
  border: "1px solid",
  background: surface.panel,
};
const inputStyle: CSSProperties = {
  ...typeScale.caption,
  minWidth: 0,
  flex: 1,
  padding: "2px 6px",
  borderRadius: radius.md,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.inset,
  color: text.primary,
};
const handleStyle: CSSProperties = { opacity: 0, pointerEvents: "none" };
