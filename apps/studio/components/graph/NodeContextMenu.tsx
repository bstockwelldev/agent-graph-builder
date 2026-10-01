import { Check, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
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
  /** Opens a submenu (one level) instead of running `onClick`: on hover,
   * click, Enter or ArrowRight; ArrowLeft or Escape closes it again. */
  submenu?: NodeContextMenuAction[];
};

const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)';
const TYPEAHEAD_RESET_MS = 600;
const SUBMENU_WIDTH = 220;

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
  bottomReserve = 56,
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
  /** Space kept clear below the menu, e.g. a mobile tab bar under it. */
  bottomReserve?: number;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const searchable = onSearchChange !== undefined;
  // The open submenu: the parent item's index and its on-screen box.
  const [sub, setSub] = useState<{ index: number; rect: DOMRect } | null>(null);
  const subIndexRef = useRef<number | null>(null);
  subIndexRef.current = sub?.index ?? null;
  const typeaheadRef = useRef({ buffer: "", at: 0 });

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const parentItem = (index: number) => menuRef.current?.querySelector<HTMLButtonElement>(`[data-submenu-index="${index}"]`) ?? null;
  const openSubmenu = (index: number, item: HTMLElement, focusFirst: boolean) => {
    setSub({ index, rect: item.getBoundingClientRect() });
    if (focusFirst) {
      window.requestAnimationFrame(() => subRef.current?.querySelector<HTMLButtonElement>(ITEM_SELECTOR)?.focus());
    }
  };
  const closeSubmenu = (refocusParent: boolean) => {
    const index = subIndexRef.current;
    setSub(null);
    if (refocusParent && index !== null) parentItem(index)?.focus({ preventScroll: true });
  };

  useEffect(() => {
    // Wave 3: focus goes back to the trigger (or wherever it was) when the
    // menu closes, instead of falling to <body>.
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const menu = menuRef.current;
    if (searchable) {
      searchInputRef.current?.focus();
    } else {
      menuRef.current?.focus();
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const inSub = Boolean(subRef.current?.contains(document.activeElement));
      if (event.key === "Escape") {
        event.preventDefault();
        // Like an OS menu: Escape closes the submenu first, then the menu.
        if (subIndexRef.current !== null) closeSubmenu(true);
        else onCloseRef.current();
        return;
      }
      const container = inSub ? subRef.current : menuRef.current;
      const items = Array.from(container?.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR) ?? []);
      const active = document.activeElement as HTMLButtonElement | null;
      const index = active ? items.indexOf(active) : -1;
      if (event.key === "ArrowRight" && active?.dataset.submenuIndex !== undefined) {
        event.preventDefault();
        openSubmenu(Number(active.dataset.submenuIndex), active, true);
        return;
      }
      if (event.key === "ArrowLeft" && inSub) {
        event.preventDefault();
        closeSubmenu(true);
        return;
      }
      if (items.length === 0) return;
      const move = (next: number) => {
        event.preventDefault();
        items[next]?.focus();
      };
      if (event.key === "ArrowDown") return move((index + 1) % items.length);
      if (event.key === "ArrowUp") return move((index - 1 + items.length) % items.length);
      if (event.key === "Home") return move(0);
      if (event.key === "End") return move(items.length - 1);
      // Typeahead: letters jump to the next item that starts with them.
      // Not while typing in the search box, and Space still activates.
      const typing = event.target instanceof HTMLInputElement;
      if (typing || event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
      const now = Date.now();
      const typeahead = typeaheadRef.current;
      if (event.key === " " && (typeahead.buffer === "" || now - typeahead.at > TYPEAHEAD_RESET_MS)) return;
      typeahead.buffer = now - typeahead.at > TYPEAHEAD_RESET_MS ? event.key.toLowerCase() : typeahead.buffer + event.key.toLowerCase();
      typeahead.at = now;
      const start = typeahead.buffer.length === 1 ? index + 1 : Math.max(index, 0);
      const ordered = [...items.slice(start), ...items.slice(0, start)];
      const match = ordered.find((item) => (item.dataset.label ?? "").toLowerCase().startsWith(typeahead.buffer));
      if (match) move(items.indexOf(match));
    };
    // A native menu doesn't outlive the window losing focus or resizing.
    // Width only: a phone's on-screen keyboard (the launcher's search box)
    // changes the height.
    const dismiss = () => onCloseRef.current();
    const openWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== openWidth) dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", onResize);
      const lost = !document.activeElement || document.activeElement === document.body || menu?.contains(document.activeElement);
      if (lost && previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
    // Mount-only: re-running on an unstable `onClose` would re-steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A right-click on the backdrop closes this menu and re-sends the click to
  // whatever is underneath, so it opens there (a native menu "moves").
  const reopenUnderPointer = (event: ReactMouseEvent) => {
    event.preventDefault();
    const { clientX, clientY } = event;
    onClose();
    const below = document
      .elementsFromPoint(clientX, clientY)
      .find((element) => element !== backdropRef.current && !menuRef.current?.contains(element) && !subRef.current?.contains(element));
    below?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY, button: 2 }));
  };

  const estimatedHeight = estimateHeight(actions) + (searchable ? ITEM_HEIGHT + spacing[2] : 0);
  const left = Math.min(x, window.innerWidth - width - 8);
  const top = Math.min(y, window.innerHeight - estimatedHeight - bottomReserve);
  const subActions = sub ? actions[sub.index]?.submenu ?? [] : [];
  const subPosition = sub ? submenuPosition(sub.rect, estimateHeight(subActions), bottomReserve) : null;

  return (
    <>
      <button
        ref={backdropRef}
        type="button"
        aria-label="Close context menu"
        onClick={onClose}
        onContextMenu={reopenUnderPointer}
        // Scrolling (the canvas zooms on wheel) closes the menu, as natively.
        onWheel={onClose}
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
        data-graph-surface=""
        className="agb-pop"
        onContextMenu={(event) => event.preventDefault()}
        style={{
          ...menuStyle,
          width,
          left,
          top,
          // Emerge from the anchor point (the trigger or the cursor), even
          // when the menu was nudged to stay inside the viewport.
          transformOrigin: `${Math.max(0, Math.min(width, x - left))}px ${Math.max(0, y - top)}px`,
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
        <MenuItems
          actions={actions}
          openIndex={sub?.index ?? null}
          onHover={(index, item) => {
            if (index !== null && actions[index]?.submenu) openSubmenu(index, item, false);
            else if (sub) setSub(null);
          }}
          onOpenSubmenu={(index, item) => openSubmenu(index, item, true)}
          onClose={onClose}
        />
      </div>
      {sub && subPosition && (
        // A sibling, not a child: the menu's pop-in animation transforms it,
        // which would make it the containing block for a fixed child.
        <div
          ref={subRef}
          role="menu"
          aria-label={actions[sub.index]?.label}
          data-graph-surface=""
          className="agb-pop"
          onContextMenu={(event) => event.preventDefault()}
          style={{ ...menuStyle, width: SUBMENU_WIDTH, ...subPosition }}
        >
          <MenuItems actions={subActions} openIndex={null} onHover={() => undefined} onOpenSubmenu={() => undefined} onClose={onClose} />
        </div>
      )}
    </>
  );
}

function MenuItems({
  actions,
  openIndex,
  onHover,
  onOpenSubmenu,
  onClose,
}: {
  actions: NodeContextMenuAction[];
  openIndex: number | null;
  onHover: (index: number | null, item: HTMLElement) => void;
  onOpenSubmenu: (index: number, item: HTMLElement) => void;
  onClose: () => void;
}) {
  return (
    <>
      {actions.map((action, index) => {
        const hasSubmenu = Boolean(action.submenu);
        return (
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
              aria-haspopup={hasSubmenu ? "menu" : undefined}
              aria-expanded={hasSubmenu ? openIndex === index : undefined}
              data-submenu-index={hasSubmenu ? index : undefined}
              data-label={action.label}
              disabled={action.disabled}
              title={action.title}
              className="agb-menu-item"
              // Hover moves focus, so pointer and arrow keys share one highlight.
              onMouseEnter={(event) => {
                if (action.disabled) return;
                event.currentTarget.focus({ preventScroll: true });
                onHover(hasSubmenu ? index : null, event.currentTarget);
              }}
              onClick={(event) => {
                if (hasSubmenu) {
                  onOpenSubmenu(index, event.currentTarget);
                  return;
                }
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
              {hasSubmenu && <ChevronRight size={14} aria-hidden="true" style={{ opacity: 0.6, flexShrink: 0 }} />}
            </button>
          </div>
        );
      })}
    </>
  );
}

function estimateHeight(actions: NodeContextMenuAction[]): number {
  const groupCount = actions.filter((action) => action.separatorBefore).length;
  const labelCount = actions.filter((action) => action.groupLabel).length;
  // + the title row and padding.
  return ITEM_HEIGHT * Math.max(actions.length, 1) + groupCount * (spacing[2] + 1) + labelCount * 20 + 40;
}

/** Beside the parent item: right of the menu, or left when it would run off-screen. */
function submenuPosition(parent: DOMRect, height: number, bottomReserve: number): { left: number; top: number } {
  const fitsRight = parent.right + 4 + SUBMENU_WIDTH <= window.innerWidth - 8;
  const left = fitsRight ? parent.right + 4 : Math.max(8, parent.left - 4 - SUBMENU_WIDTH);
  const top = Math.max(8, Math.min(parent.top - spacing[2], window.innerHeight - height - bottomReserve));
  return { left, top };
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
  // No background here: an inline one would override the hover/focus rules
  // on .agb-menu-item in globals.css.
  cursor: "pointer",
  ...typeScale.caption,
  fontWeight: 500,
};
