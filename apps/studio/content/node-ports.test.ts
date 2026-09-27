import { describe, expect, it } from "vitest";

import {
  acceptsAnyKind,
  computePortDragCompatibility,
  declareFromInferred,
  declaredPorts,
  inputKindLabel,
  inputPortsFor,
  updatePortContract,
  withDeclaredPorts,
} from "./node-ports";

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

describe("port authoring", () => {
  it("declares from the inferred ports, keeping ids so runtime binding is unchanged", () => {
    const router = { type: "router" as const };
    expect(declareFromInferred(router, "output").map((p) => [p.id, p.contract.kind])).toEqual([
      ["passthrough", "message"],
      ["decision", "decision"],
    ]);
    expect(declareFromInferred({ type: "transform" as const, config: { type: "format_message", template: "{value}" } }, "output")[0].contract.kind).toBe("message");
  });

  it("seeds a kind-agnostic input from what arrives, only when the sources agree", () => {
    expect(declareFromInferred({ type: "tool" as const }, "input", ["message"])[0].contract.kind).toBe("message");
    expect(declareFromInferred({ type: "output" as const }, "input", ["tool-result", "message"])[0].contract.kind).toBe("message");
    expect(declareFromInferred({ type: "tool" as const }, "input", [])[0].contract.kind).toBe("structured-json");
    // Typed inputs keep their catalog kind regardless of what arrives.
    expect(declareFromInferred({ type: "code_exec" as const }, "input", ["message"])[0].contract.kind).toBe("structured-json");
  });

  it("updates one port and resets a direction back to inferred", () => {
    const declared = declareFromInferred({ type: "llm" as const }, "input");
    const typed = updatePortContract(declared, "input", { kind: "structured-json", schema: { type: "object" } });
    const ports = withDeclaredPorts(undefined, "input", typed);
    expect(declaredPorts(ports!, "input")?.[0].contract).toEqual({ kind: "structured-json", schema: { type: "object" } });
    expect(withDeclaredPorts(ports, "input", null)).toBeUndefined();
    expect(withDeclaredPorts({ ...ports, output_ports: declareFromInferred({ type: "llm" as const }, "output") }, "input", null)?.input_ports).toBeUndefined();
  });
});
