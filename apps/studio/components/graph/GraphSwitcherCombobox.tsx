"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Command } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import type { GraphSummary } from "@bstockwelldev/agent-graph-sdk";
import { border, fontFamily, localType, radius, shadow, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { fieldStyle } from "./ui/fields";

// Replaces the old "Switch graph" toggle button + reserved-width docked
// side panel (studio-consolidation Phase 7/8's GraphLibrary): that pattern
// cost real canvas width just to pick a different graph, and needed an
// explicit open/close step (a whole panel) distinct from the choice
// itself. A combobox collapses both into one interaction — click, type to
// filter, pick — and the canvas never loses width since nothing is
// reserved for it while closed or open.
//
// Styled from the canvas tokens (canvas-styling-plan.md, PR 2). The list is
// `cmdk` used headless, so filtering and the arrow-key behaviour are its own;
// the highlighted row is styled in app/globals.css (`.agb-cmdk`), since an
// inline style can't express cmdk's `data-selected`.
const POPOVER_WIDTH = 288;

export function GraphSwitcherCombobox({
  graphs,
  activeGraphId,
  activeGraphName,
  loading = false,
  iconOnly = false,
  openDirection = "down",
  onSelect,
  onOpenChange,
  onBrowseAll,
}: {
  graphs: Pick<GraphSummary, "id" | "name">[];
  activeGraphId: string | null;
  /** Current graph's name, known immediately from the editor's own state —
   * used as the trigger label until `graphs` has been fetched (lazily, on
   * first open), so the trigger doesn't show a generic "Switch graph"
   * placeholder for a graph that's already open and named. */
  activeGraphName?: string | null;
  loading?: boolean;
  /** Icon-only trigger for the compact/mobile bottom action bar. */
  iconOnly?: boolean;
  /** "up" for a trigger anchored near the bottom of the viewport (the
   * mobile bottom action bar) so the popover doesn't run off-screen. */
  openDirection?: "down" | "up";
  onSelect: (graphId: string) => void;
  /** Fired on open/close so the caller can lazily (re)fetch `graphs`. */
  onOpenChange?: (open: boolean) => void;
  /** Adds a "Browse all…" item that opens the graph picker (canvas-first-landing-plan.md §3). */
  onBrowseAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  // Viewport-anchored popover position, measured from the trigger on open.
  // The popover is portaled to document.body (see below), so `top`/`bottom`
  // are viewport coordinates for `position: fixed`.
  const [popoverPos, setPopoverPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const activeGraph = graphs.find((graph) => graph.id === activeGraphId) ?? null;
  const triggerLabel = activeGraph?.name ?? activeGraphName ?? "Switch graph";

  const setOpenAndNotify = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  // Measure the trigger's viewport rect when the popover opens. `fixed`
  // positioning (via the portal below) is relative to the viewport, so the
  // popover tracks the trigger even though it no longer lives inside the
  // header's layout.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Keep the popover on-screen horizontally.
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    setPopoverPos(
      openDirection === "up"
        ? { bottom: window.innerHeight - rect.top + 8, left }
        : { top: rect.bottom + 8, left },
    );
  }, [open, openDirection]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenAndNotify(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpenAndNotify is stable per render intent
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={triggerRef}>
      {iconOnly ? (
        <IconButton
          label="Switch graph"
          icon={<ChevronsUpDown size={16} aria-hidden="true" />}
          // 28px, not the kit's 32: the header's identity group has no pixels to spare.
          style={{ minWidth: 28, width: 28, height: 28 }}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpenAndNotify(!open)}
        />
      ) : (
        <Button
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpenAndNotify(!open)}
          // The old shadcn `sm` footprint (h-7, px-2.5, 0.8rem), not the kit's roomier default: the
          // header's identity group clips its content, so extra pixels push Save into the next control.
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing[2],
            maxWidth: 224,
            padding: "4px 10px",
            fontSize: "0.8rem",
            lineHeight: "20px",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triggerLabel}</span>
          <ChevronsUpDown size={14} aria-hidden="true" style={{ flexShrink: 0, color: text.secondary }} />
        </Button>
      )}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Full-viewport transparent backdrop dismisses on outside click —
                same convention as ConnectKindMenu/NodeContextMenu's floating
                panels elsewhere in this codebase. */}
            <button
              type="button"
              aria-label="Close graph switcher"
              onClick={() => setOpenAndNotify(false)}
              style={{ position: "fixed", inset: 0, zIndex: 39, border: 0, padding: 0, background: "transparent", cursor: "default" }}
            />
            <div
              className="agb-pop"
              data-graph-surface=""
              // Portaled to document.body: the trigger lives inside
              // GraphHeader's identity group, which is `overflow: hidden` (it
              // must stay that way so the group clips instead of overlapping
              // its neighbors at narrow widths). An absolutely-positioned
              // popover in there gets cut off and the graph list never
              // appears; `fixed` in a portal escapes every clipping ancestor.
              // Hidden until measured so the first paint never flashes the
              // popover at the wrong spot (the layout effect above runs
              // before paint).
              style={{
                position: "fixed",
                zIndex: 40,
                width: POPOVER_WIDTH,
                maxWidth: "calc(100vw - 2rem)",
                transformOrigin: openDirection === "up" ? "bottom left" : "top left",
                ...(popoverPos ?? { visibility: "hidden" }),
              }}
            >
              <Command
                label="Graphs"
                className="agb-cmdk"
                style={{
                  overflow: "hidden",
                  borderRadius: radius.lg,
                  border: `1px solid ${border.subtle}`,
                  background: surface.panel,
                  color: text.primary,
                  boxShadow: shadow[4],
                }}
              >
                <div style={{ padding: spacing[2], borderBottom: `1px solid ${border.subtle}` }}>
                  <Command.Input
                    placeholder="Find a graph…"
                    autoFocus
                    className="agb-field"
                    style={{ ...fieldStyle, minHeight: 30, padding: "4px 10px" }}
                  />
                </div>
                <Command.List style={{ maxHeight: 280, overflowY: "auto", padding: spacing[1] }}>
                  {loading ? (
                    <div style={{ padding: `${spacing[4]}px ${spacing[3]}px`, textAlign: "center", ...typeScale.caption, color: text.secondary }}>Loading graphs…</div>
                  ) : (
                    <>
                      <Command.Empty style={{ padding: `${spacing[4]}px ${spacing[3]}px`, textAlign: "center", ...typeScale.caption, color: text.secondary }}>
                        No graphs found.
                      </Command.Empty>
                      <Command.Group>
                        {graphs.map((graph) => {
                          const active = graph.id === activeGraphId;
                          return (
                            <Command.Item
                              key={graph.id}
                              value={`${graph.name} ${graph.id}`}
                              onSelect={() => {
                                setOpenAndNotify(false);
                                onSelect(graph.id);
                              }}
                              style={itemStyle}
                            >
                              <Check size={14} aria-hidden="true" style={{ flexShrink: 0, opacity: active ? 1 : 0 }} />
                              <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{graph.name}</span>
                                <span style={{ ...typeScale.caption, color: text.secondary, fontFamily: fontFamily.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {graph.id}
                                </span>
                              </span>
                            </Command.Item>
                          );
                        })}
                      </Command.Group>
                    </>
                  )}
                  {onBrowseAll ? (
                    <Command.Group forceMount>
                      {/* forceMount: stays listed whatever is typed. */}
                      <Command.Item
                        forceMount
                        value="browse all graphs"
                        onSelect={() => {
                          setOpenAndNotify(false);
                          onBrowseAll();
                        }}
                        style={{ ...itemStyle, borderTop: `1px solid ${border.subtle}`, marginTop: spacing[1] }}
                      >
                        <span style={{ flex: 1 }}>Browse all…</span>
                        <span style={{ ...typeScale.caption, color: text.secondary }}>⌘O</span>
                      </Command.Item>
                    </Command.Group>
                  ) : null}
                </Command.List>
              </Command>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: spacing[2],
  padding: `${spacing[2]}px ${spacing[2]}px`,
  borderRadius: radius.md,
  cursor: "pointer",
  ...localType.ui,
} as const;
