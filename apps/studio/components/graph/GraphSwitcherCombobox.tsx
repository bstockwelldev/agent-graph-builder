"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";
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
  graphs: GraphDefinition[];
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
  const activeGraph = graphs.find((graph) => graph.id === activeGraphId) ?? null;
  const triggerLabel = activeGraph?.name ?? activeGraphName ?? "Switch graph";

  const setOpenAndNotify = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

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
    <div className="relative">
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
      {open && (
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
              "absolute left-0 z-40 w-72 max-w-[calc(100vw-2rem)]",
              openDirection === "up" ? "bottom-full mb-2" : "top-full mt-2",
            )}
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
        </>
      )}
    </div>
  );
}
