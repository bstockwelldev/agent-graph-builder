"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useShellLayout } from "@/hooks/useShellLayout";
import { isEditableKeyboardTarget } from "@/lib/graphAuthoring";
import { WORKBENCH_PANELS, matchesHotkey, type WorkbenchPanelId } from "./panels";

// Studio-consolidation Phase 8 — promotes the drawer mechanism (ShellDrawer/
// useShellLayout, ported in Phase 7 but scoped entirely inside GraphEditor)
// into an app-wide "workbench": one place any route can open a panel from,
// via a hotkey, a menu/button, or the command palette. `useShellLayout()` is
// hosted here (a single instance) rather than duplicated per consumer.
type WorkbenchContextValue = {
  activePanel: WorkbenchPanelId | null;
  /** Opaque payload set by the caller that opened the panel (e.g. the
   * command palette's "recent sessions" entries pass `{ chatSessionId }`
   * so ChatPanel can preselect that session) — cleared on `close`. */
  panelContext: unknown;
  open: (panel: WorkbenchPanelId, context?: unknown) => void;
  close: () => void;
  toggle: (panel: WorkbenchPanelId) => void;
  isCompact: boolean;
  reducedMotion: boolean;
  drawerPanelWidth: string;
};

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<WorkbenchPanelId | null>(null);
  const [panelContext, setPanelContext] = useState<unknown>(null);
  const shellLayout = useShellLayout();

  const open = useCallback((panel: WorkbenchPanelId, context?: unknown) => {
    setActivePanel(panel);
    setPanelContext(context ?? null);
  }, []);
  const close = useCallback(() => {
    setActivePanel(null);
    setPanelContext(null);
  }, []);
  const toggle = useCallback(
    (panel: WorkbenchPanelId) => setActivePanel((current) => (current === panel ? null : panel)),
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      for (const [id, meta] of Object.entries(WORKBENCH_PANELS)) {
        if (meta.hotkey && matchesHotkey(event, meta.hotkey)) {
          event.preventDefault();
          toggle(id as WorkbenchPanelId);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const value = useMemo<WorkbenchContextValue>(
    () => ({
      activePanel,
      panelContext,
      open,
      close,
      toggle,
      isCompact: shellLayout.isCompact,
      reducedMotion: shellLayout.reducedMotion,
      drawerPanelWidth: shellLayout.drawerPanelWidth,
    }),
    [
      activePanel,
      panelContext,
      open,
      close,
      toggle,
      shellLayout.isCompact,
      shellLayout.reducedMotion,
      shellLayout.drawerPanelWidth,
    ],
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchContextValue {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error("useWorkbench must be used within a WorkbenchProvider");
  return context;
}
