import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasEdgeLegend } from "./CanvasEdgeLegend";

afterEach(() => {
  cleanup();
});

describe("CanvasEdgeLegend", () => {
  it("names Always / Match text / Fallback without relying on color", () => {
    render(<CanvasEdgeLegend visible />);
    expect(screen.getByRole("note", { name: "Edge kinds" })).toBeTruthy();
    expect(screen.getByText("Always")).toBeTruthy();
    expect(screen.getByText("Match text")).toBeTruthy();
    expect(screen.getByText("Fallback")).toBeTruthy();
  });
});
