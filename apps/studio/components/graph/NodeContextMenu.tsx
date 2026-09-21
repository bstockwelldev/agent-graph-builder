import { useEffect, useId, useRef, type CSSProperties } from "react";
import { color, radius, shadow, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";

// A quick action list, not primary navigation — a smaller target than
// shell.touchTarget.min (44px, this app's node-handle standard) is
// reasonable here, and it's what the `top` clamp formula below assumes:
// widening this without updating that estimate is what caused the menu to
// misjudge its own height and run off the bottom of the viewport for
// longer lists (the empty-canvas "Add node" menu, 12 entries).
const ITEM_HEIGHT = 32;

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
  /** Native tooltip text, e.g. a caveat for a non-obvious action. */
  title?: string;
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
          top: Math.min(y, window.innerHeight - ITEM_HEIGHT * actions.length - 56),
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
            title={action.title}
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
  display: "flex",
  alignItems: "center",
  width: "100%",
  textAlign: "left",
  minHeight: ITEM_HEIGHT,
  padding: `2px ${spacing[2]}px`,
  borderRadius: radius.md,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  ...typeScale.caption,
  fontWeight: 500,
};
