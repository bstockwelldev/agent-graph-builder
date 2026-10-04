"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown } from "lucide-react";
import type { GraphSummary } from "@bstockwelldev/agent-graph-sdk";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

// Replaces the old "Switch graph" toggle button + reserved-width docked
// side panel (studio-consolidation Phase 7/8's GraphLibrary): that pattern
// cost real canvas width just to pick a different graph, and needed an
// explicit open/close step (a whole panel) distinct from the choice
// itself. A combobox collapses both into one interaction — click, type to
// filter, pick — and the canvas never loses width since nothing is
// reserved for it while closed or open.
export function GraphSwitcherCombobox({
  graphs,
  activeGraphId,
  activeGraphName,
  loading = false,
  iconOnly = false,
  openDirection = "down",
  onSelect,
  onOpenChange,
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
    // w-72 = 288px; keep the popover on-screen horizontally.
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 288 - 8));
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
    <div className="relative" ref={triggerRef}>
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? "icon-sm" : "sm"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={iconOnly ? "Switch graph" : undefined}
        className={iconOnly ? undefined : "max-w-56 justify-between gap-2"}
        onClick={() => setOpenAndNotify(!open)}
      >
        {iconOnly ? (
          <ChevronsUpDown className="size-4" />
        ) : (
          <>
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
          </>
        )}
      </Button>
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
              className="fixed inset-0 z-30 cursor-default bg-transparent"
              onClick={() => setOpenAndNotify(false)}
            />
            <div
              className={cn(
                "animate-in fade-in-0 zoom-in-95 fixed z-40 w-72 max-w-[calc(100vw-2rem)] duration-150",
                openDirection === "up" ? "slide-in-from-bottom-1 origin-bottom-left" : "slide-in-from-top-1 origin-top-left",
              )}
              // Portaled to document.body: the trigger lives inside
              // GraphHeader's identity group, which is `overflow: hidden` (it
              // must stay that way so the group clips instead of overlapping
              // its neighbors at narrow widths). An absolutely-positioned
              // popover in there gets cut off and the graph list never
              // appears; `fixed` in a portal escapes every clipping ancestor.
              // Hidden until measured so the first paint never flashes the
              // popover at the wrong spot (the layout effect above runs
              // before paint).
              style={popoverPos ?? { visibility: "hidden" }}
            >
              <Command className="border border-border shadow-lg">
                <CommandInput placeholder="Find a graph…" autoFocus />
                <CommandList>
                  {loading ? (
                    <div className="text-muted-foreground px-3 py-6 text-center text-sm">Loading graphs…</div>
                  ) : (
                    <>
                      <CommandEmpty>No graphs found.</CommandEmpty>
                      <CommandGroup>
                        {graphs.map((graph) => {
                          const active = graph.id === activeGraphId;
                          return (
                            <CommandItem
                              key={graph.id}
                              value={`${graph.name} ${graph.id}`}
                              onSelect={() => {
                                setOpenAndNotify(false);
                                onSelect(graph.id);
                              }}
                            >
                              <Check className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-0")} />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate font-medium">{graph.name}</span>
                                <span className="text-muted-foreground truncate text-xs">{graph.id}</span>
                              </span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
