import { useEffect, useId, useRef, type CSSProperties } from "react";
import { color, radius, shadow, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";

// Right-click menu for the graph canvas (studio-consolidation Phase 7) —
// modeled on ConnectKindMenu.tsx's floating-menu-at-cursor pattern (same
// dismiss-on-outside-click/Escape behavior), generalized to a plain action
// list so one component covers node, edge, and empty-canvas right-clicks.
// New scope: no equivalent ever existed in AGB's playground, studio, or
// micro-ui-agent-builder.
export type NodeContextMenuAction = {
  label: string;
  onClick: () => void;
  tone?: "default" | "destructive";
};

export function NodeContextMenu({
  x,
  y,
  title,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  title: string;
  actions: NodeContextMenuAction[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    menuRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close context menu"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: shell.zIndex.backdrop,
          background: "transparent",
          border: "none",
          cursor: "default",
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          ...menuStyle,
          left: Math.min(x, window.innerWidth - 240),
          top: Math.min(y, window.innerHeight - 32 * actions.length - 56),
        }}
      >
        <div id={titleId} style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>
          {title}
        </div>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            onClick={() => {
              action.onClick();
              onClose();
            }}
            style={{
              ...itemStyle,
              color: action.tone === "destructive" ? color.error[500] : text.primary,
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}

const menuStyle: CSSProperties = {
  position: "fixed",
  zIndex: shell.zIndex.tooltip,
  width: 220,
  maxHeight: "70vh",
  overflowY: "auto",
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.panel,
  boxShadow: shadow[4],
  outline: "none",
};

const itemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  minHeight: shell.touchTarget.min,
  padding: `${spacing[1]}px ${spacing[2]}px`,
  borderRadius: radius.md,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  ...typeScale.caption,
  fontWeight: 500,
};
