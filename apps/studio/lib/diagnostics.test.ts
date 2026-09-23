import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@bstockwelldev/agent-graph-sdk";

import { buildIssueMaps, tabForDiagnostic } from "./diagnostics";

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

// studio-graph-workbench-redesign-plan.md, Slice 4: the node badge shows a
// count and every message, worst severity first.
describe("buildIssueMaps", () => {
  it("collects every message per node, escalating to the worst severity", () => {
    const { nodeIssues } = buildIssueMaps([
      diagnostic({ node_id: "n1", severity: "warning", message: "warn A" }),
      diagnostic({ node_id: "n1", severity: "error", message: "err B" }),
      diagnostic({ node_id: "n1", severity: "warning", message: "warn C" }),
      diagnostic({ node_id: "n2", severity: "warning", message: "only" }),
    ]);
    expect(nodeIssues.get("n1")).toEqual({ severity: "error", caption: "err B", messages: ["err B", "warn A", "warn C"] });
    expect(nodeIssues.get("n2")).toEqual({ severity: "warning", caption: "only", messages: ["only"] });
  });
});
