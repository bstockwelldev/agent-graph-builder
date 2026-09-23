import { Check } from "lucide-react";
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
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
  /** Renders a checkmark column (radio/toggle items in the Layout and
   * overflow menus -- studio-graph-workbench-redesign-plan.md, Slice 1).
   * `undefined` means "not a checkable item"; `false` reserves the column. */
  checked?: boolean;
  disabled?: boolean;
  /** Starts a new group: a divider, plus `groupLabel` as a caption if set. */
  separatorBefore?: boolean;
  groupLabel?: string;
  /** Right-aligned keyboard hint, e.g. "⌘S". */
  shortcut?: string;
  icon?: ReactNode;
  /** Keep the menu open after clicking (e.g. toggles in a settings menu). */
  keepOpen?: boolean;
};

/** Menu anchor just below (or above, near the viewport bottom) a trigger
 * element, left-aligned with it -- the "menus emerge from their trigger"
 * rule (review section 55) for every header menu. */
export function menuAnchorFor(trigger: HTMLElement, align: "left" | "right" = "left", width = 240): { x: number; y: number } {
  const rect = trigger.getBoundingClientRect();
  const x = align === "right" ? rect.right - width : rect.left;
  return { x: Math.max(8, x), y: rect.bottom + 4 };
}

export function NodeContextMenu({
  x,
  y,
  title,
  actions,
  onClose,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  width = 220,
}: {
  x: number;
  y: number;
  title: string;
  actions: NodeContextMenuAction[];
  onClose: () => void;
  /** Phase 10 Slice C follow-up, "searchable node launcher": when set
   * (with onSearchChange), renders a filter input above the action list.
   * `actions` is expected to already be filtered by the caller — this
   * component doesn't filter its own list, it just renders the box. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Shown instead of the (empty) action list when search matches none. */
  emptyMessage?: string;
  width?: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const searchable = onSearchChange !== undefined;

  useEffect(() => {
    if (searchable) {
      searchInputRef.current?.focus();
    } else {
      menuRef.current?.focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)') ?? [],
      );
      if (items.length === 0) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, searchable]);

  const groupCount = actions.filter((action) => action.separatorBefore).length;
  const labelCount = actions.filter((action) => action.groupLabel).length;
  const estimatedHeight =
    ITEM_HEIGHT * Math.max(actions.length, 1) +
    groupCount * (spacing[2] + 1) +
    labelCount * 20 +
    (searchable ? ITEM_HEIGHT + spacing[2] : 0);

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
          width,
          left: Math.min(x, window.innerWidth - width - 8),
          top: Math.min(y, window.innerHeight - estimatedHeight - 56),
        }}
      >
        <div id={titleId} style={{ ...typeScale.caption, opacity: 0.6, marginBottom: spacing[1] }}>
          {title}
        </div>
        {searchable && (
          <input
            ref={searchInputRef}
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            style={searchInputStyle}
          />
        )}
        {searchable && actions.length === 0 && (
          <div style={{ ...typeScale.caption, opacity: 0.6, padding: `${spacing[1]}px ${spacing[2]}px` }}>
            {emptyMessage}
          </div>
        )}
        {actions.map((action) => (
          <div key={action.label}>
            {action.separatorBefore && (
              <div role="separator" style={{ height: 1, background: surface.border, margin: `${spacing[1]}px 0` }} />
            )}
            {action.groupLabel && (
              <div style={{ ...typeScale.caption, opacity: 0.55, padding: `2px ${spacing[2]}px` }}>{action.groupLabel}</div>
            )}
            <button
              type="button"
              role={action.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={action.checked === undefined ? undefined : action.checked}
              disabled={action.disabled}
              title={action.title}
              className="agb-menu-item"
              onClick={() => {
                action.onClick();
                if (!action.keepOpen) onClose();
              }}
              style={{
                ...itemStyle,
                color: action.tone === "destructive" ? color.error[500] : text.primary,
                opacity: action.disabled ? 0.45 : 1,
                cursor: action.disabled ? "not-allowed" : "pointer",
              }}
            >
              {action.checked !== undefined && (
                <span style={{ width: 16, display: "inline-flex", flexShrink: 0 }} aria-hidden="true">
                  {action.checked && <Check size={14} />}
                </span>
              )}
              {action.icon && (
                <span style={{ display: "inline-flex", flexShrink: 0, opacity: 0.8 }} aria-hidden="true">
                  {action.icon}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>{action.label}</span>
              {action.shortcut && <span style={{ opacity: 0.5, fontWeight: 400 }}>{action.shortcut}</span>}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

const menuStyle: CSSProperties = {
  position: "fixed",
  zIndex: shell.zIndex.tooltip,
  maxHeight: "70vh",
  overflowY: "auto",
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.panel,
  boxShadow: shadow[4],
  outline: "none",
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginBottom: spacing[1],
  padding: `4px ${spacing[2]}px`,
  borderRadius: radius.md,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  ...typeScale.caption,
};

const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[2],
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
