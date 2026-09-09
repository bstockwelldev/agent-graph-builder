import { useCallback, useEffect, useState } from "react";
import { shell } from "../theme";

export type ShellBreakpoint = "desktop" | "compact" | "phone";
export type ShellDrawer = "library" | "inspector" | "run";

export function useShellLayout() {
  const [breakpoint, setBreakpoint] = useState<ShellBreakpoint>("desktop");
  const [openDrawer, setOpenDrawer] = useState<ShellDrawer | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
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
    if (breakpoint === "desktop") {
      setOpenDrawer(null);
    }
  }, [breakpoint]);

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

  const toggleDrawer = useCallback((drawer: ShellDrawer) => {
    setOpenDrawer((current) => (current === drawer ? null : drawer));
  }, []);

  const closeDrawer = useCallback(() => setOpenDrawer(null), []);

  const isCompact = breakpoint !== "desktop";
  const authoringEnabled = breakpoint !== "phone";

  return {
    breakpoint,
    isCompact,
    authoringEnabled,
    openDrawer,
    setOpenDrawer,
    toggleDrawer,
    closeDrawer,
    reducedMotion,
  };
}
