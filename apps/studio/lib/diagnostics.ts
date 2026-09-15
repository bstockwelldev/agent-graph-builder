import type { CSSProperties } from "react";
import type { Edge } from "@xyflow/react";
import type { GraphNodeData } from "@/components/graph/nodes/GraphNodeView";
import { color } from "./graph-theme";
import type { Diagnostic, EdgeKind } from "@bstockwelldev/agent-graph-sdk";

export type CompileIssue = {
  severity: "error" | "warning";
  caption: string;
};

export function buildIssueMaps(diagnostics: Diagnostic[]): {
  nodeIssues: Map<string, CompileIssue>;
  edgeIssues: Map<string, CompileIssue>;
} {
  const nodeIssues = new Map<string, CompileIssue>();
  const edgeIssues = new Map<string, CompileIssue>();

  for (const diagnostic of diagnostics) {
    const issue: CompileIssue = { severity: diagnostic.severity, caption: diagnostic.message };
    if (diagnostic.edge_id) {
      const existing = edgeIssues.get(diagnostic.edge_id);
      if (!existing || (diagnostic.severity === "error" && existing.severity === "warning")) {
        edgeIssues.set(diagnostic.edge_id, issue);
      }
    }
    if (diagnostic.node_id) {
      const existing = nodeIssues.get(diagnostic.node_id);
      if (!existing || (diagnostic.severity === "error" && existing.severity === "warning")) {
        nodeIssues.set(diagnostic.node_id, issue);
      }
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
