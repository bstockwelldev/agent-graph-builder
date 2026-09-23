import type { CSSProperties } from "react";
import type { Edge } from "@xyflow/react";
import type { GraphNodeData } from "@/components/graph/nodes/GraphNodeView";
import { color } from "./graph-theme";
import type { Diagnostic, EdgeKind } from "@bstockwelldev/agent-graph-sdk";

export type CompileIssue = {
  /** Worst severity among this object's diagnostics. */
  severity: "error" | "warning";
  /** Message of the worst (first-seen, at that severity) diagnostic. */
  caption: string;
  /** Every diagnostic message for this object, worst first -- the node
   * card's badge shows the count and lists them all on hover, instead of
   * one sentence truncated to 42 characters
   * (studio-graph-workbench-redesign-plan.md, Slice 4). */
  messages?: string[];
};

function mergeIssue(existing: CompileIssue | undefined, diagnostic: Diagnostic): CompileIssue {
  if (!existing) {
    return { severity: diagnostic.severity, caption: diagnostic.message, messages: [diagnostic.message] };
  }
  const escalates = diagnostic.severity === "error" && existing.severity === "warning";
  const messages = escalates
    ? [diagnostic.message, ...(existing.messages ?? [existing.caption])]
    : [...(existing.messages ?? [existing.caption]), diagnostic.message];
  return escalates
    ? { severity: "error", caption: diagnostic.message, messages }
    : { ...existing, messages };
}

export function buildIssueMaps(diagnostics: Diagnostic[]): {
  nodeIssues: Map<string, CompileIssue>;
  edgeIssues: Map<string, CompileIssue>;
} {
  const nodeIssues = new Map<string, CompileIssue>();
  const edgeIssues = new Map<string, CompileIssue>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.edge_id) {
      edgeIssues.set(diagnostic.edge_id, mergeIssue(edgeIssues.get(diagnostic.edge_id), diagnostic));
    }
    if (diagnostic.node_id) {
      nodeIssues.set(diagnostic.node_id, mergeIssue(nodeIssues.get(diagnostic.node_id), diagnostic));
    }
  }

  return { nodeIssues, edgeIssues };
}

export function edgeStrokeForKind(kind: EdgeKind, issue?: CompileIssue): { stroke: string; strokeWidth: number } {
  if (issue?.severity === "error") {
    return { stroke: color.error[600], strokeWidth: 3 };
  }
  if (issue?.severity === "warning") {
    return { stroke: color.warning[600], strokeWidth: 3 };
  }
  return { stroke: kind === "conditional" ? color.primary[600] : kind === "default" ? color.warning[600] : color.neutral[400], strokeWidth: 1.5 };
}

export function applyEdgePointerAffordance(
  style: CSSProperties | undefined,
  emphasized: boolean,
): CSSProperties {
  const raw = style?.strokeWidth;
  const base = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? "1.5")) || 1.5;
  return { ...style, strokeWidth: emphasized ? base + 1.5 : base };
}

export function diagnosticsForNode(diagnostics: Diagnostic[], nodeId: string): Diagnostic[] {
  return diagnostics.filter((d) => d.node_id === nodeId);
}

export function diagnosticsForEdge(diagnostics: Diagnostic[], edgeId: string): Diagnostic[] {
  return diagnostics.filter((d) => d.edge_id === edgeId);
}

export function hasBlockingErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.blocking);
}

/** Diagnostics-as-navigation (studio-ux-gap-remediation-plan.md §1): route a
 * clicked diagnostic to the NodeInspector tab that owns its category.
 * "structure"/"capability" (and legacy diagnostics with no category at all)
 * fall back to Configure — they're graph-level or unsupported-feature
 * issues without a specific I/O or policy home. */
export function tabForDiagnostic(diagnostic: Diagnostic): string {
  switch (diagnostic.category) {
    case "contract":
      return "io";
    case "policy":
      return "policy";
    default:
      return "configure";
  }
}

export function validationSummary(diagnostics: Diagnostic[]): { errors: number; warnings: number; label: string } {
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  if (errors === 0 && warnings === 0) {
    return { errors, warnings, label: "Ready" };
  }
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return { errors, warnings, label: parts.join(", ") };
}

export type NodeWithCompileIssue = {
  data: GraphNodeData;
};

export function fingerprintIssueMaps(diagnostics: Diagnostic[]): string {
  const { nodeIssues, edgeIssues } = buildIssueMaps(diagnostics);
  return JSON.stringify({
    n: [...nodeIssues.entries()].sort(([a], [b]) => a.localeCompare(b)),
    e: [...edgeIssues.entries()].sort(([a], [b]) => a.localeCompare(b)),
  });
}

export function applyCompileIssueToNodeData(data: GraphNodeData, issue: CompileIssue | undefined): GraphNodeData {
  return { ...data, compileIssue: issue ?? null };
}

export function applyCompileIssueToEdge(edge: Edge, issue: CompileIssue | undefined): Edge {
  const kind = (edge.data?.kind as EdgeKind) ?? "sequence";
  const { stroke, strokeWidth } = edgeStrokeForKind(kind, issue);
  return {
    ...edge,
    style: { ...edge.style, stroke, strokeWidth },
  };
}

/**
 * Which config field a diagnostic concerns (Wave 2.5 inline diagnostics),
 * or null when it isn't about one specific field. Backend typed-config
 * errors are formatted `"<type> node '<id>': <field>[.<sub>]: <msg>"`
 * (backend/app/compiler.py + node_configs.py `_format_error`); a few codes
 * map to a field directly.
 */
export function fieldForDiagnostic(diagnostic: Pick<Diagnostic, "code" | "message">): string | null {
  if (diagnostic.code === "UNSUPPORTED_TOOL_BINDING") return "toolName";
  if (/_(NO_OUTGOING_EDGES|MISSING_FALLBACK|NO_CONDITIONAL_EDGES)$/.test(diagnostic.code)) return "routes";
  const match = diagnostic.message.match(/node '[^']*': ([A-Za-z_][A-Za-z0-9_]*)(?:\.[^:]*)?: /);
  return match ? match[1] : null;
}

/** Splits a node's diagnostics into per-field buckets (for the fields the
 * current form actually renders) and the rest, which stay in the panel's
 * top banner. Port-level (`port_id`) and policy issues are left out of the
 * banner: they live on the I/O and Policy tabs, whose tab badges count them. */
export function partitionDiagnosticsByField(
  issues: Diagnostic[],
  renderedFields: readonly string[],
): { byField: Record<string, Diagnostic[]>; rest: Diagnostic[] } {
  const rendered = new Set(renderedFields);
  const byField: Record<string, Diagnostic[]> = {};
  const rest: Diagnostic[] = [];
  for (const issue of issues) {
    const field = fieldForDiagnostic(issue);
    if (field && rendered.has(field)) {
      (byField[field] ??= []).push(issue);
    } else if (!issue.port_id && issue.category !== "policy") {
      rest.push(issue);
    }
  }
  return { byField, rest };
}
