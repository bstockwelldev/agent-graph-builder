import { describe, expect, it } from "vitest";

import { computePortDragCompatibility } from "./node-ports";

describe("computePortDragCompatibility", () => {
  it("is compatible when kinds match exactly", () => {
    expect(computePortDragCompatibility("message", "message")).toBe("compatible");
    expect(computePortDragCompatibility("approval", "approval")).toBe("compatible");
  });

  it("needs a transform when the target expects message from a different kind", () => {
    expect(computePortDragCompatibility("tool-result", "message")).toBe("needs-transform");
    expect(computePortDragCompatibility("decision", "message")).toBe("needs-transform");
  });

  it("needs a transform when either side is a structured kind", () => {
    expect(computePortDragCompatibility("structured-json", "tool-result")).toBe("needs-transform");
    expect(computePortDragCompatibility("artifact", "documents")).toBe("needs-transform");
  });

  it("is incompatible when neither the message nor structured-kind rule applies", () => {
    expect(computePortDragCompatibility("approval", "decision")).toBe("incompatible");
    expect(computePortDragCompatibility("error", "approval")).toBe("incompatible");
  });
});
