// Canvas-width layout rules (canvas-workbench-ergonomics-plan.md §2, §8).
// The shell's breakpoints follow the viewport, but what squeezes the header
// and the bottom overlays is the canvas column: at 1180-1440px wide, docked
// panels leave it only 500-750px. These rules take the measured column (or
// pane) width instead.

/** The narrowest the canvas column may get before the inspector overlays it. */
export const CANVAS_MIN_WIDTH = 480;

/** Docked widths (Tailwind `w-72` palette, `w-96` inspector). */
export const DOCKED_PALETTE_WIDTH = 288;
export const DOCKED_INSPECTOR_WIDTH = 384;

/**
 * How much the graph header shows at a given canvas-column width.
 * - `full`: everything.
 * - `snug`: the save state shows as a dot only, the graph switcher as an
 *   icon, and the health chip moves to ⋯.
 * - `tight`: the add-node, layout, focus and chat buttons also move to ⋯.
 */
export type HeaderDensity = "full" | "snug" | "tight";

export const HEADER_SNUG_BELOW = 1120;
export const HEADER_TIGHT_BELOW = 760;

export function headerDensity(canvasWidth: number): HeaderDensity {
  // 0 means not measured yet; assume the common desktop case.
  if (canvasWidth <= 0 || canvasWidth >= HEADER_SNUG_BELOW) return "full";
  return canvasWidth >= HEADER_TIGHT_BELOW ? "snug" : "tight";
}

export type MinimapLayout =
  | { mode: "full" | "small"; width: number; height: number }
  | { mode: "collapsed" };

/** The minimap sized by the pane: 200×150, 160×110, or a "Map" button below 700px. */
export function minimapLayout(paneWidth: number): MinimapLayout {
  if (paneWidth <= 0 || paneWidth >= 1000)
    return { mode: "full", width: 200, height: 150 };
  if (paneWidth >= 700) return { mode: "small", width: 160, height: 110 };
  return { mode: "collapsed" };
}

/** The palette folded to its icon strip (§4). */
export const PALETTE_STRIP_WIDTH = 56;

/**
 * How the docked palette and inspector share the graph surface so the
 * canvas column keeps CANVAS_MIN_WIDTH (§8): first the palette folds to its
 * icon strip, then the inspector floats over the canvas instead of docking.
 * Measured from the whole graph surface (not the canvas column), so
 * switching modes can't feed back into the measurement.
 */
export function dockLayout({
  surfaceWidth,
  paletteOpen,
  paletteCollapsed,
  inspectorOpen,
}: {
  surfaceWidth: number;
  paletteOpen: boolean;
  /** The viewer's own choice (the palette's collapse button). */
  paletteCollapsed: boolean;
  inspectorOpen: boolean;
}): { paletteCollapsed: boolean; inspectorOverlay: boolean } {
  if (surfaceWidth <= 0) return { paletteCollapsed, inspectorOverlay: false };
  const inspector = inspectorOpen ? DOCKED_INSPECTOR_WIDTH : 0;
  const fits = (palette: number) => surfaceWidth - palette - inspector >= CANVAS_MIN_WIDTH;
  if (!paletteOpen) return { paletteCollapsed, inspectorOverlay: inspectorOpen && !fits(0) };
  if (!paletteCollapsed && fits(DOCKED_PALETTE_WIDTH)) return { paletteCollapsed: false, inspectorOverlay: false };
  return { paletteCollapsed: true, inspectorOverlay: inspectorOpen && !fits(PALETTE_STRIP_WIDTH) };
}

/** Whether the docked inspector would squeeze the canvas column below CANVAS_MIN_WIDTH. */
export function inspectorOverlaysCanvas(surfaceWidth: number, paletteDocked: boolean): boolean {
  return dockLayout({ surfaceWidth, paletteOpen: paletteDocked, paletteCollapsed: false, inspectorOpen: true }).inspectorOverlay;
}

/** Focus mode's neighborhood size: 1-3 hops. */
export function clampFocusHops(hops: number): number {
  return Math.min(3, Math.max(1, Math.round(hops)));
}
