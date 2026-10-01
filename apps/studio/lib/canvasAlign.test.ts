import { describe, expect, it } from "vitest";

import {
  alignBoxes,
  distributeBoxes,
  snapToGrid,
  snapToGuides,
  type Box,
} from "./canvasAlign";

const a: Box = { id: "a", x: 0, y: 0, width: 100, height: 40 };
const b: Box = { id: "b", x: 200, y: 100, width: 200, height: 60 };
const c: Box = { id: "c", x: 50, y: 300, width: 50, height: 20 };

describe("alignBoxes", () => {
  it("lines boxes up on their shared bounds", () => {
    expect(alignBoxes([a, b, c], "left")).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 100 },
      c: { x: 0, y: 300 },
    });
    expect(alignBoxes([a, b], "right")).toEqual({
      a: { x: 300, y: 0 },
      b: { x: 200, y: 100 },
    });
    // Bounds 0..400 → center 200.
    expect(alignBoxes([a, b], "center")).toEqual({
      a: { x: 150, y: 0 },
      b: { x: 100, y: 100 },
    });
    expect(alignBoxes([a, b], "top")).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 200, y: 0 },
    });
    expect(alignBoxes([a, b], "bottom")).toEqual({
      a: { x: 0, y: 120 },
      b: { x: 200, y: 100 },
    });
    expect(alignBoxes([a, b], "middle")).toEqual({
      a: { x: 0, y: 60 },
      b: { x: 200, y: 50 },
    });
    expect(alignBoxes([a], "left")).toEqual({});
  });
});

describe("distributeBoxes", () => {
  it("evens the gaps, keeping the outer boxes in place", () => {
    const boxes: Box[] = [
      { id: "1", x: 0, y: 0, width: 100, height: 10 },
      { id: "2", x: 120, y: 5, width: 100, height: 10 },
      { id: "3", x: 500, y: 0, width: 100, height: 10 },
    ];
    // Span 0..600, widths 300 → gaps of 150.
    expect(distributeBoxes(boxes, "horizontal")).toEqual({
      "1": { x: 0, y: 0 },
      "2": { x: 250, y: 5 },
      "3": { x: 500, y: 0 },
    });
    expect(distributeBoxes(boxes.slice(0, 2), "horizontal")).toEqual({});
    expect(distributeBoxes([a, b, c], "vertical").b).toEqual({
      x: 200,
      y: 140,
    });
  });
});

describe("snapToGuides", () => {
  it("snaps to the nearest edge or center within the threshold, per axis, and draws guides", () => {
    const moving: Box = { id: "m", x: 203, y: 400, width: 100, height: 40 };
    const { position, guides } = snapToGuides(moving, [b]);
    // Left edge 203 → b's left edge 200.
    expect(position).toEqual({ x: 200, y: 400 });
    expect(guides).toEqual([
      { orientation: "vertical", at: 200, from: 100, to: 440 },
    ]);
  });

  it("leaves the position alone past the threshold, and ignores the dragged node itself", () => {
    const moving: Box = { id: "b", x: 230, y: 400, width: 100, height: 40 };
    expect(snapToGuides(moving, [b, a]).guides).toEqual([]);
    expect(snapToGuides({ ...moving, id: "m" }, [b], 6).position).toEqual({
      x: 230,
      y: 400,
    });
  });

  it("matches centers too", () => {
    // Already centered on b on both axes (center x 300, middle y 130).
    const moving: Box = { id: "m", x: 198, y: 128, width: 204, height: 4 };
    const { position, guides } = snapToGuides(moving, [b]);
    expect(position).toEqual({ x: 198, y: 128 });
    expect(guides.map((guide) => guide.orientation)).toEqual([
      "vertical",
      "horizontal",
    ]);
  });
});

describe("snapToGrid", () => {
  it("rounds to the grid", () => {
    expect(snapToGrid({ x: 37, y: 11 }, 24)).toEqual({ x: 48, y: 0 });
    expect(snapToGrid({ x: 37, y: 11 }, 12)).toEqual({ x: 36, y: 12 });
  });
});
