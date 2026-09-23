"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isEditableKeyboardTarget } from "@/lib/graphAuthoring";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useWorkbench } from "./WorkbenchProvider";
import { WORKBENCH_PANELS, type WorkbenchPanelId } from "./panels";

/**
 * Static reference overlay (not a guided tour) listing this app's hotkeys
 * and gestures, organized by the real UI areas they belong to rather than
 * as free-floating tooltips pinned to live DOM elements — the latter would
 * need per-element positioning logic for comparatively little benefit over
 * a well-organized reference the user can scan once and dismiss. Toggled by
 * the "?" key (a deliberate exception to this app's usual "mod+shift+<key>"
 * hotkey convention — bare "?" is the near-universal shortcuts-help key in
 * browser-based tools, and `matchesHotkey`'s shift-must-match-exactly check
 * doesn't fit a symbol that inherently requires Shift to type, so this
 * panel manages its own listener rather than going through the shared
 * per-panel hotkey loop in WorkbenchProvider).
 */
const PANEL_ID: WorkbenchPanelId = "help";

export function HelpOverlay() {
  const workbench = useWorkbench();
  const open = workbench.activePanel === PANEL_ID;
  const dialogRef = useRef<HTMLDivElement>(null);
  // Wave 3: modal -- trap focus, restore it to the opener on close.
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        workbench.toggle(PANEL_ID);
      }
      // Escape is handled by WorkbenchProvider for every panel (Wave 3).
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, workbench]);

  if (!open) return null;

  const globalPanelHotkeys = (
    Object.entries(WORKBENCH_PANELS) as [WorkbenchPanelId, (typeof WORKBENCH_PANELS)[WorkbenchPanelId]][]
  ).filter(([, meta]) => meta.scope === "global" && meta.hotkey);

  return (
    <>
      <button
        type="button"
        aria-label="Close help"
        onClick={() => workbench.close()}
        tabIndex={-1}
        className="animate-in fade-in-0 fixed inset-0 z-40 bg-black/40 duration-200"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shortcuts and gestures"
        data-workbench-drawer=""
        className="animate-in fade-in-0 zoom-in-95 duration-200 glass-panel ghost-border fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Shortcuts &amp; gestures</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => workbench.close()}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <HelpSection title="Canvas navigation">
            <HelpRow keys="Drag / swipe" description="Pan the canvas" />
            <HelpRow keys="Scroll / pinch" description="Zoom in or out" />
            <HelpRow keys="Click / tap" description="Select a node or edge to inspect it" />
            <HelpRow keys="Double-click / double-tap" description="Zoom in on that node" />
            <HelpRow keys="Drag from a handle" description="Connect two nodes" />
            <HelpRow keys="Shift + drag connect" description="Force the edge-kind picker (conditional/default) on any node" />
            <HelpRow keys="Right-click / tap and hold" description="Node, edge, or empty-canvas quick actions" />
          </HelpSection>

          <HelpSection title="Editing">
            <HelpRow keys="Delete / Backspace" description="Remove the selected node or edge" />
            <HelpRow keys="Ctrl/Cmd + Z" description="Undo" />
            <HelpRow keys="Ctrl/Cmd + Shift + Z" description="Redo" />
          </HelpSection>

          <HelpSection title="Workbench panels">
            {globalPanelHotkeys.map(([id, meta]) => (
              <HelpRow key={id} keys={formatHotkey(meta.hotkey!)} description={meta.title} />
            ))}
            <HelpRow keys="Ctrl/Cmd + K" description="Command palette — jump to any route or panel" />
            <HelpRow keys="?" description="Toggle this overlay" />
            <HelpRow
              keys="Switch graph / Add node / Run"
              description="Graph-only panels — open from the HUD buttons above the canvas, or the bottom bar on narrow screens"
            />
          </HelpSection>

          <HelpSection title="Everywhere">
            <HelpRow keys="Escape" description="Close the open menu, dialog, or panel" />
          </HelpSection>
        </div>
      </div>
    </>
  );
}

function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function HelpRow({ keys, description }: { keys: string; description: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <dt className="bg-muted w-fit rounded px-1.5 py-0.5 font-mono text-xs">{keys}</dt>
      <dd className="text-muted-foreground">{description}</dd>
    </div>
  );
}

function formatHotkey(hotkey: string): string {
  return hotkey
    .split("+")
    .map((part) => (part === "mod" ? "Ctrl/Cmd" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" + ");
}
