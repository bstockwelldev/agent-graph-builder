"use client";

import type { ReactNode } from "react";
import { ShellDrawer } from "@/components/graph/ShellDrawer";
import { useWorkbench } from "./WorkbenchProvider";
import { WORKBENCH_PANELS, type WorkbenchPanelId } from "./panels";

// Centralizes the docked-div-vs-ShellDrawer decision that GraphEditor.tsx
// used to hand-write three times (studio-consolidation Phase 8). Renders
// nothing when `panelId` isn't the active panel.
export function WorkbenchDrawer({
  panelId,
  side,
  mode = "floating",
  className = "",
  dockedClassName = "",
  children,
}: {
  panelId: WorkbenchPanelId;
  side: "left" | "right";
  /**
   * "floating" (default): `fixed`-positioned overlay, unchanged from Phase
   * 8's original behavior — used by the app-wide resource/chat panels
   * mounted in studio-shell.tsx, where there's no canvas underneath that
   * needs to make room.
   *
   * "docked-reserve": a plain flex child with no position override —
   * the caller places it as a real sibling of the canvas in a flex row, so
   * the browser reserves its width and the canvas actually shrinks instead
   * of being covered. Fixes a real bug (reported directly against the
   * graph canvas): a "floating" run/palette/library panel has no relation
   * to node positions, so it can — and did — render on top of live nodes
   * near the panel's screen position, blocking clicks on them. Reserving
   * space instead means nodes are never hidden under a panel; they're
   * either visible in the remaining canvas width or scrolled out of view
   * (a pannable state, not a hidden one) — and FlowCanvas's existing
   * ResizeObserver-driven `paneSize` effect (`useCanvasOrientation` +
   * `runFitView`) already re-fits the view to whatever width remains, with
   * no code change needed here: shrinking the container is enough to
   * trigger it.
   */
  mode?: "floating" | "docked-reserve";
  /** Extra classes for the docked (desktop) container only. */
  dockedClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  const workbench = useWorkbench();
  if (workbench.activePanel !== panelId) return null;

  if (workbench.isCompact) {
    return (
      <ShellDrawer
        open
        onClose={workbench.close}
        side={side}
        title={WORKBENCH_PANELS[panelId].title}
        drawerId={`workbench-drawer-${panelId}`}
        reducedMotion={workbench.reducedMotion}
        panelWidth={workbench.drawerPanelWidth}
      >
        {children}
      </ShellDrawer>
    );
  }

  if (mode === "docked-reserve") {
    // `min-h-0` is load-bearing: as a flex item, `h-full` alone leaves
    // `min-height: auto` (content-based), so a child's `overflow-y-auto`
    // never actually engages — instead the panel grows to fit its content
    // and stretches the whole flex row (including the canvas), which
    // surfaced as page-level scroll instead of panel-internal scroll, and
    // as the canvas viewport re-fitting to a moving pane size after a run.
    return (
      <div className={`glass-panel ghost-border h-full min-h-0 shrink-0 ${className} ${dockedClassName}`}>
        {children}
      </div>
    );
  }

  // `fixed`, not `absolute` — this renders at the studio-shell level too
  // (resource browser panels, part A), where the nearest positioned
  // ancestor isn't guaranteed to fill the viewport the way GraphEditor's
  // full-bleed canvas root does, so `absolute` would scroll away on
  // taller pages instead of floating in place.
  return (
    // `bg-popover` on top of glass-panel: a floating panel sits over the
    // canvas AND the docked selection dock, whose text bled through the
    // 82%-opaque glass (Wave 2 visual QA).
    <div
      className={`glass-panel ghost-border fixed z-30 rounded-2xl border shadow-2xl ${className} ${dockedClassName}`}
      style={{ background: "var(--popover)" }}
    >
      {children}
    </div>
  );
}
