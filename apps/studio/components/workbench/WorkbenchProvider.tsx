"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";
import { useShellLayout } from "@/hooks/useShellLayout";
import { isEditableKeyboardTarget } from "@/lib/graphAuthoring";
import { WORKBENCH_PANELS, matchesHotkey, type WorkbenchPanelId } from "./panels";

/**
 * Chat context binding (studio-ux-gap-remediation-plan.md §3, STO-596).
 * Published by GraphEditor whenever a graph is open, so global panels
 * (ChatPanel renders outside the GraphEditor tree) can read the current
 * canvas/selection/run without prop-drilling. `getGraph` is a function
 * rather than a snapshot so the graph is only serialized when a message is
 * actually sent -- the canvas may be dirty (unsaved) between renders.
 */
export type StudioGraphContext = {
  graphId: string;
  graphName: string;
  getGraph: () => GraphDefinition;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  runId: string | null;
  /** Wave 2 (studio-graph-workbench-redesign-plan.md): global panels
   * (Analytics) navigate back into the open graph -- select + pan to a
   * node, or paint a run onto the canvas -- without a route change. */
  focusNode?: (nodeId: string, tab?: string) => void;
  inspectRun?: (runId: string) => void;
};

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
  /** Current graph/selection/run context, published by GraphEditor. `null`
   * when no graph is open (e.g. on /agents). See StudioGraphContext. */
  graphContext: StudioGraphContext | null;
  setGraphContext: (context: StudioGraphContext | null) => void;
};

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

const PANEL_OR_MENU = '[data-workbench-panel], [data-workbench-drawer], [role="menu"]';

/**
 * Something above the panels already owns Escape: an open menu, listbox,
 * or a modal dialog that isn't itself a workbench panel (the command
 * palette, a shadcn dialog, the expanded template editor). Those register
 * their own Escape handlers -- often as later `window` listeners that run
 * after ours -- so the panel must not close underneath them.
 */
export function hasOverlayOwningEscape(doc: Document = document): boolean {
  return Boolean(
    doc.querySelector('[role="menu"], [role="listbox"], [role="dialog"][aria-modal="true"]:not([data-workbench-drawer])'),
  );
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<WorkbenchPanelId | null>(null);
  const [panelContext, setPanelContext] = useState<unknown>(null);
  const [graphContext, setGraphContext] = useState<StudioGraphContext | null>(null);
  const shellLayout = useShellLayout();
  // Wave 3: the control that opened the current panel, so closing it
  // (Escape, its close button, a hotkey) hands focus back instead of
  // dropping it on <body>.
  const openerRef = useRef<HTMLElement | null>(null);
  const lastOutsideFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !event.target.closest(PANEL_OR_MENU)) lastOutsideFocusRef.current = event.target;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);
  // The opener is whatever had focus outside every panel and menu: a panel
  // opened from a menu item (header Run▾ → "Run controls") resolves to the
  // menu's trigger, not the item that's about to unmount.
  const rememberOpener = () => {
    const active = document.activeElement;
    openerRef.current =
      active instanceof HTMLElement && active !== document.body && !active.closest(PANEL_OR_MENU)
        ? active
        : lastOutsideFocusRef.current;
  };

  const open = useCallback((panel: WorkbenchPanelId, context?: unknown) => {
    rememberOpener();
    setActivePanel(panel);
    setPanelContext(context ?? null);
  }, []);
  const close = useCallback(() => {
    setActivePanel(null);
    setPanelContext(null);
  }, []);
  const toggle = useCallback((panel: WorkbenchPanelId) => {
    setActivePanel((current) => {
      if (current !== panel) rememberOpener();
      return current === panel ? null : panel;
    });
  }, []);

  // Focus return: once a panel closes and its content unmounts, focus has
  // fallen to <body> -- put it back on the opener if it's still there.
  const previousPanelRef = useRef<WorkbenchPanelId | null>(null);
  useEffect(() => {
    const previous = previousPanelRef.current;
    previousPanelRef.current = activePanel;
    if (!previous || activePanel === previous) return;
    // No recorded opener (the panel was open on load, or re-targeted by a
    // menu while open): fall back to the last focus outside every panel.
    const opener = openerRef.current ?? lastOutsideFocusRef.current;
    if (activePanel === null) openerRef.current = null;
    // Drawers keep their content mounted for the exit animation and restore
    // focus themselves (useFocusTrap); this catches docked/floating panels.
    const frame = window.requestAnimationFrame(() => {
      const focused = document.activeElement;
      const lost = !focused || focused === document.body;
      if (activePanel === null && lost && opener?.isConnected) opener.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePanel]);

  // Escape closes the active panel (review section 80) -- unless a menu,
  // listbox or non-panel dialog is open, or a handler already consumed it.
  useEffect(() => {
    if (!activePanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || hasOverlayOwningEscape()) return;
      event.preventDefault();
      setActivePanel(null);
      setPanelContext(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel]);

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
      graphContext,
      setGraphContext,
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
      graphContext,
    ],
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): WorkbenchContextValue {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error("useWorkbench must be used within a WorkbenchProvider");
  return context;
}
