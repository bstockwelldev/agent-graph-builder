import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@bstockwelldev/agent-graph-sdk";

import { tabForDiagnostic } from "./diagnostics";

function diagnostic(overrides: Partial<Diagnostic>): Diagnostic {
  return {
    severity: "error",
    code: "TEST_CODE",
    message: "test message",
    blocking: false,
    ...overrides,
  };
}

describe("tabForDiagnostic", () => {
  it("routes a contract diagnostic to the I/O tab", () => {
    expect(tabForDiagnostic(diagnostic({ category: "contract" }))).toBe("io");
  });

  it("routes a policy diagnostic to the Policy tab", () => {
    expect(tabForDiagnostic(diagnostic({ category: "policy" }))).toBe("policy");
  });

  it("falls back to Configure for structural diagnostics", () => {
    expect(tabForDiagnostic(diagnostic({ category: "structure" }))).toBe("configure");
  });

  it("falls back to Configure for capability diagnostics", () => {
    expect(tabForDiagnostic(diagnostic({ category: "capability" }))).toBe("configure");
  });

  it("falls back to Configure for a legacy diagnostic with no category", () => {
    expect(tabForDiagnostic(diagnostic({}))).toBe("configure");
  });
});
