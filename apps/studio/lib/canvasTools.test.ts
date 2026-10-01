import { describe, expect, it } from "vitest";

import {
  flowInteraction,
  toolForKey,
  toolLabel,
  zoomAround,
} from "./canvasTools";

describe("canvas tools", () => {
  it("picks tools by Figma's keys", () => {
    expect(toolForKey("v")).toBe("select");
    expect(toolForKey("H")).toBe("hand");
    expect(toolForKey("m")).toBe("marquee");
    expect(toolForKey("c")).toBe("connect");
    expect(toolForKey("z")).toBe("zoom");
    expect(toolForKey("x")).toBeNull();
    expect(toolLabel("marquee")).toBe("Marquee");
  });

  it("maps each tool to React Flow's interaction props", () => {
    expect(flowInteraction("select")).toMatchObject({
      panOnDrag: true,
      selectionOnDrag: false,
      nodesDraggable: true,
    });
    expect(flowInteraction("hand")).toMatchObject({
      panOnDrag: true,
      nodesDraggable: false,
    });
    expect(flowInteraction("marquee")).toMatchObject({
      panOnDrag: [1, 2],
      selectionOnDrag: true,
    });
    expect(flowInteraction("zoom")).toMatchObject({
      panOnDrag: false,
    });
    // Holding Space is a temporary Hand, whatever the tool.
    expect(flowInteraction("marquee", true)).toEqual(flowInteraction("hand"));
  });

  it("zooms around the clicked point, within limits", () => {
    const next = zoomAround({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 50 }, 2, {
      min: 0.15,
      max: 2,
    });
    expect(next).toEqual({ zoom: 2, x: -100, y: -50 });
    // The flow point under the cursor stays under it: (100 - x) / zoom.
    expect((100 - next.x) / next.zoom).toBe(100);
    expect(
      zoomAround({ x: 0, y: 0, zoom: 1.5 }, { x: 0, y: 0 }, 2, {
        min: 0.15,
        max: 2,
      }).zoom,
    ).toBe(2);
  });
});
