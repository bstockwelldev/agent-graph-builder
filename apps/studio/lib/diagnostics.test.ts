import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@bstockwelldev/agent-graph-sdk";

import { buildIssueMaps, fieldForDiagnostic, partitionDiagnosticsByField, tabForDiagnostic } from "./diagnostics";

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

// Wave 2.5: diagnostics render inline under the field they concern.
describe("fieldForDiagnostic / partitionDiagnosticsByField", () => {
  it("maps typed-config errors, tool bindings, and router route issues to fields", () => {
    expect(fieldForDiagnostic(diagnostic({ code: "NODE_CONFIG_INVALID", message: "tool_loop node 'tl_1': maxToolIterations: Input should be less than or equal to 64" }))).toBe("maxToolIterations");
    expect(fieldForDiagnostic(diagnostic({ code: "NODE_CONFIG_INVALID", message: "code_exec node 'c': content: String should have at least 1 character" }))).toBe("content");
    expect(fieldForDiagnostic(diagnostic({ code: "UNSUPPORTED_TOOL_BINDING", message: "x" }))).toBe("toolName");
    expect(fieldForDiagnostic(diagnostic({ code: "ROUTER_MISSING_FALLBACK", message: "x" }))).toBe("routes");
    expect(fieldForDiagnostic(diagnostic({ code: "GRAPH_UNREACHABLE_NODE", message: "Node 'x' is not reachable" }))).toBeNull();
  });

  it("buckets rendered fields and keeps port/policy issues out of the banner", () => {
    const content = diagnostic({ code: "NODE_CONFIG_INVALID", message: "code_exec node 'c': content: too short" });
    const unreachable = diagnostic({ code: "GRAPH_UNREACHABLE_NODE", message: "Node 'c' is not reachable" });
    const port = diagnostic({ code: "CONTRACT", message: "port", port_id: "input" });
    const policy = diagnostic({ code: "POLICY", message: "policy", category: "policy" });
    const hidden = diagnostic({ code: "NODE_CONFIG_INVALID", message: "code_exec node 'c': other: bad" });
    const result = partitionDiagnosticsByField([content, unreachable, port, policy, hidden], ["content"]);
    expect(result.byField).toEqual({ content: [content] });
    expect(result.rest).toEqual([unreachable, hidden]);
  });
});
