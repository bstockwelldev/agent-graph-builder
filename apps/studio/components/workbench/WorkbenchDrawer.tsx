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
  className = "",
  dockedClassName = "",
  children,
}: {
  panelId: WorkbenchPanelId;
  side: "left" | "right";
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

  // `fixed`, not `absolute` — this renders at the studio-shell level too
  // (resource browser panels, part A), where the nearest positioned
  // ancestor isn't guaranteed to fill the viewport the way GraphEditor's
  // full-bleed canvas root does, so `absolute` would scroll away on
  // taller pages instead of floating in place.
  return (
    <div className={`glass-panel ghost-border fixed z-20 rounded-2xl border ${className} ${dockedClassName}`}>
      {children}
    </div>
  );
}
