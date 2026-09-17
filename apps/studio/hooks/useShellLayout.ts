import { useCallback, useEffect, useState } from "react";
import { drawerPanelWidth, shouldUseInspectorDrawer } from "@/lib/shellLayout";
import { shell } from "@/lib/graph-theme";

export type ShellBreakpoint = "desktop" | "compact" | "phone";
export type ShellDrawerName = "library" | "palette" | "run";

export function useShellLayout() {
  const [breakpoint, setBreakpoint] = useState<ShellBreakpoint>("desktop");
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : shell.breakpoint.wide,
  );
  const [isWide, setIsWide] = useState(true);
  const [inspectorInDrawer, setInspectorInDrawer] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<ShellDrawerName | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      setViewportWidth(width);
      setIsWide(width >= shell.breakpoint.wide);
      setInspectorInDrawer(shouldUseInspectorDrawer(width));
      if (width < shell.breakpoint.phone) {
        setBreakpoint("phone");
      } else if (width < shell.breakpoint.compact) {
        setBreakpoint("compact");
      } else {
        setBreakpoint("desktop");
      }
    };

    updateBreakpoint();
    window.addEventListener("resize", updateBreakpoint);
    return () => window.removeEventListener("resize", updateBreakpoint);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    return () => media.removeEventListener("change", updateMotion);
  }, []);

  useEffect(() => {
    if (!openDrawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDrawer(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openDrawer]);

  const toggleDrawer = useCallback((drawer: ShellDrawerName) => {
    setOpenDrawer((current) => (current === drawer ? null : drawer));
  }, []);

  const closeDrawer = useCallback(() => setOpenDrawer(null), []);

  const isCompact = breakpoint !== "desktop";

  return {
    breakpoint,
    isCompact,
    isPhone: breakpoint === "phone",
    isWide,
    inspectorInDrawer,
    drawerPanelWidth: drawerPanelWidth(viewportWidth),
    openDrawer,
    setOpenDrawer,
    toggleDrawer,
    closeDrawer,
    reducedMotion,
  };
}
