import { useEffect, useState } from "react";

/**
 * Keeps an element mounted for `exitMs` after `show` turns false so it can
 * play an exit animation (studio-graph-workbench-redesign-plan.md, Wave 3:
 * "drawers slide"). ShellDrawer used to return null the instant it closed,
 * so its transform transition could never run. With `reducedMotion` the
 * element unmounts immediately.
 */
export function usePresence(show: boolean, exitMs: number, reducedMotion = false): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    if (reducedMotion || exitMs <= 0) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [exitMs, reducedMotion, show]);

  const visible = show || mounted;
  return { mounted: visible, closing: visible && !show };
}
