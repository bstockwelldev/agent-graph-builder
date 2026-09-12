import { describe, expect, it } from "vitest";

import { canFitView } from "./canvasFit";

describe("canFitView", () => {
  it("allows fit when the pane has positive width and height", () => {
    expect(canFitView(800, 600)).toBe(true);
  });

  it("blocks fit when width is 0", () => {
    expect(canFitView(0, 600)).toBe(false);
  });

  it("blocks fit when height is 0", () => {
    expect(canFitView(800, 0)).toBe(false);
  });

  it("blocks fit when both dimensions are 0", () => {
    expect(canFitView(0, 0)).toBe(false);
  });

  it("blocks fit when a dimension is negative", () => {
    expect(canFitView(-1, 600)).toBe(false);
    expect(canFitView(800, -1)).toBe(false);
  });
});
