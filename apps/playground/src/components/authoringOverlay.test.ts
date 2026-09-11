import { describe, expect, it } from "vitest";
import { shell } from "../theme";

describe("authoring overlay stacking", () => {
  it("keeps taxonomy tooltips above the coach panel", () => {
    const coachZIndex = 15;
    expect(shell.zIndex.tooltip).toBeGreaterThan(coachZIndex);
  });
});
