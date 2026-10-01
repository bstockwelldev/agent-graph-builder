import { describe, expect, it } from "vitest";

import {
  clampFocusHops,
  dockLayout,
  headerDensity,
  inspectorOverlaysCanvas,
  minimapLayout,
} from "./canvasLayout";

describe("headerDensity", () => {
  it("drops header items as the canvas column narrows", () => {
    expect(headerDensity(0)).toBe("full");
    expect(headerDensity(1200)).toBe("full");
    expect(headerDensity(1120)).toBe("full");
    expect(headerDensity(1119)).toBe("snug");
    expect(headerDensity(760)).toBe("snug");
    expect(headerDensity(759)).toBe("tight");
    expect(headerDensity(480)).toBe("tight");
  });
});

describe("minimapLayout", () => {
  it("sizes the minimap by the pane, collapsing it below 700px", () => {
    expect(minimapLayout(0)).toEqual({ mode: "full", width: 200, height: 150 });
    expect(minimapLayout(1200)).toEqual({
      mode: "full",
      width: 200,
      height: 150,
    });
    expect(minimapLayout(999)).toEqual({
      mode: "small",
      width: 160,
      height: 110,
    });
    expect(minimapLayout(700)).toEqual({
      mode: "small",
      width: 160,
      height: 110,
    });
    expect(minimapLayout(699)).toEqual({ mode: "collapsed" });
  });
});

describe("dockLayout", () => {
  const layout = (surfaceWidth: number, paletteOpen: boolean, inspectorOpen: boolean, paletteCollapsed = false) =>
    dockLayout({ surfaceWidth, paletteOpen, paletteCollapsed, inspectorOpen });

  it("docks both when the canvas keeps 480px", () => {
    expect(layout(1256, true, true)).toEqual({ paletteCollapsed: false, inspectorOverlay: false });
  });

  it("folds the palette to its strip before floating the inspector", () => {
    // 1120 − 288 − 384 = 448 < 480, but 1120 − 56 − 384 = 680.
    expect(layout(1120, true, true)).toEqual({ paletteCollapsed: true, inspectorOverlay: false });
    // Even the strip doesn't leave 480px: the inspector floats too.
    expect(layout(900, true, true)).toEqual({ paletteCollapsed: true, inspectorOverlay: true });
  });

  it("keeps the viewer's own collapse, and floats the inspector alone when needed", () => {
    expect(layout(1920, true, false, true)).toEqual({ paletteCollapsed: true, inspectorOverlay: false });
    expect(layout(800, false, true)).toEqual({ paletteCollapsed: false, inspectorOverlay: true });
    expect(layout(0, true, true)).toEqual({ paletteCollapsed: false, inspectorOverlay: false });
  });

  it("still answers the inspector-only question", () => {
    expect(inspectorOverlaysCanvas(1108, false)).toBe(false);
    expect(inspectorOverlaysCanvas(800, false)).toBe(true);
  });
});

describe("clampFocusHops", () => {
  it("keeps hops between 1 and 3", () => {
    expect(clampFocusHops(0)).toBe(1);
    expect(clampFocusHops(2)).toBe(2);
    expect(clampFocusHops(9)).toBe(3);
  });
});
