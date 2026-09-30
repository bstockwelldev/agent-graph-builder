import { describe, expect, it } from "vitest";

import {
  clampFocusHops,
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

describe("inspectorOverlaysCanvas", () => {
  it("floats the inspector when docking it would leave the canvas under 480px", () => {
    // 1180px viewport minus the 72px rail: palette + inspector leave 436px.
    expect(inspectorOverlaysCanvas(1108, true)).toBe(true);
    expect(inspectorOverlaysCanvas(1108, false)).toBe(false);
    // 1256px viewport: 512px left.
    expect(inspectorOverlaysCanvas(1184, true)).toBe(false);
    expect(inspectorOverlaysCanvas(800, false)).toBe(true);
    expect(inspectorOverlaysCanvas(0, true)).toBe(false);
  });
});

describe("clampFocusHops", () => {
  it("keeps hops between 1 and 3", () => {
    expect(clampFocusHops(0)).toBe(1);
    expect(clampFocusHops(2)).toBe(2);
    expect(clampFocusHops(9)).toBe(3);
  });
});
