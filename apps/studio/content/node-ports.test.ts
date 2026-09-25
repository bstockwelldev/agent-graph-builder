import { describe, expect, it } from "vitest";

import { acceptsAnyKind, computePortDragCompatibility, inputKindLabel, inputPortsFor } from "./node-ports";

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

describe("kind-agnostic inputs (mirror of backend ports.py)", () => {
  it("covers tool, output and transform default inputs only", () => {
    for (const type of ["tool", "output", "transform"] as const) expect(acceptsAnyKind({ type })).toBe(true);
    for (const type of ["llm", "prompt", "code_exec", "router"] as const) expect(acceptsAnyKind({ type })).toBe(false);
  });

  it("types author-declared ports again", () => {
    const input_ports = [{ id: "in", name: "in", direction: "input" as const, contract: { kind: "structured-json" as const } }];
    expect(acceptsAnyKind({ type: "tool", input_ports })).toBe(false);
    expect(inputKindLabel({ type: "tool", input_ports }, input_ports[0])).toBe("structured-json");
  });

  it("labels an agnostic default input as any", () => {
    const [port] = inputPortsFor({ type: "tool" });
    expect(inputKindLabel({ type: "tool" }, port)).toBe("any");
  });
});
