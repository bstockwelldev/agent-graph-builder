import { describe, expect, it } from "vitest";

import { EDGE_COLORS, dashArray, readEdgeStyle, resolveEdgeLook, withEdgeStyle } from "./edgeStyle";

describe("edge styles", () => {
  it("reads only valid style values", () => {
    expect(readEdgeStyle(null)).toEqual({});
    expect(readEdgeStyle({ style: { pattern: "dashed", weight: "huge", color: "red" } })).toEqual({ pattern: "dashed" });
    expect(readEdgeStyle({ style: "solid" })).toEqual({});
  });

  it("stores the style alongside other extension keys, and drops it when empty", () => {
    expect(withEdgeStyle(null, { pattern: "dotted" })).toEqual({ style: { pattern: "dotted" } });
    expect(withEdgeStyle({ keep: 1, style: { pattern: "dotted" } }, { weight: "thick" })).toEqual({ keep: 1, style: { weight: "thick" } });
    expect(withEdgeStyle({ keep: 1, style: { pattern: "dotted" } }, {})).toEqual({ keep: 1 });
    expect(withEdgeStyle({ style: { pattern: "dotted" } }, { pattern: undefined })).toBeNull();
  });

  it("defaults the pattern by kind", () => {
    const base = { stroke: "#999", strokeWidth: 1.5 };
    expect(resolveEdgeLook("sequence", {}, base).strokeDasharray).toBeUndefined();
    expect(resolveEdgeLook("conditional", {}, base).strokeDasharray).toBe(dashArray("dashed", 1.5));
    expect(resolveEdgeLook("default", {}, base).strokeDasharray).toBe(dashArray("dotted", 1.5));
    expect(resolveEdgeLook("default", { pattern: "solid" }, base).strokeDasharray).toBeUndefined();
  });

  it("applies weight and color, but a validation issue keeps its own", () => {
    const base = { stroke: "#999", strokeWidth: 1.5 };
    const blue = EDGE_COLORS.find((option) => option.value === "blue")!.stroke;
    expect(resolveEdgeLook("sequence", { weight: "thick", color: "blue" }, base)).toEqual({ stroke: blue, strokeWidth: 3, strokeDasharray: undefined });
    const issue = { stroke: "#d1453b", strokeWidth: 3 };
    expect(resolveEdgeLook("sequence", { weight: "thin", color: "blue" }, issue, true)).toMatchObject({ stroke: "#d1453b", strokeWidth: 3 });
  });

  it("has no red in the palette: red means failed", () => {
    expect(EDGE_COLORS.map((option) => option.value)).not.toContain("red");
  });
});
