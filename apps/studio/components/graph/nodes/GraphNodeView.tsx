import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
  Code2,
  GitBranch,
  GitFork,
  ListChecks,
  LogIn,
  LogOut,
  PauseCircle,
  PenLine,
  Repeat,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { CompileIssue } from "@/lib/diagnostics";
import type { NodeType } from "@bstockwelldev/agent-graph-sdk";
import { color, fontFamily, localType, nodeType as nodeTypeTokens, nodeTypeGlow, radius, shadow, shell, spacing, status as statusColor, text } from "@/lib/graph-theme";

const ICONS: Record<NodeType, LucideIcon> = {
  input: LogIn,
  prompt: PenLine,
  llm: Bot,
  tool: Wrench,
  router: GitBranch,
  output: LogOut,
  // Absorbed from micro-ui-agent-builder's FlowStep vocabulary
  // (studio-consolidation program) — fully executable as of Phase 2, but
  // not yet creatable via NodePalette.tsx; icons are provisional.
  guardrail: ShieldCheck,
  rubric: ListChecks,
  human_gate: PauseCircle,
  tool_loop: Repeat,
  code_exec: Code2,
  branch: GitFork,
};

export interface GraphNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  label: string;
  config: Record<string, unknown>;
  // "paused" added for the `human_gate` node type (studio-consolidation
  // Phase 2) — not creatable via NodePalette.tsx yet, but a NodeTrace can
  // already carry this status once the API is used directly.
  status?: "idle" | "running" | "succeeded" | "failed" | "paused";
  compileIssue?: CompileIssue | null;
  inspectionDimmed?: boolean;
}

function issueBorderColor(issue: CompileIssue | null | undefined): string {
  if (issue?.severity === "error") return color.error[600];
  if (issue?.severity === "warning") return color.warning[600];
  return nodeTypeTokens.input.border;
}

function truncateCaption(caption: string, max = 42): string {
  return caption.length > max ? `${caption.slice(0, max - 1)}…` : caption;
}

function shapeStyles(type: NodeType): CSSProperties {
  switch (type) {
    case "output":
      return { borderRadius: 999, padding: `${spacing[4]}px ${spacing[8]}px` };
    case "router":
      return {
        borderRadius: radius.sm,
        clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
        padding: `${spacing[8]}px ${spacing[6]}px`,
        minWidth: 220,
        textAlign: "center",
      };
    case "tool":
      return { borderRadius: radius.sm };
    case "prompt":
      return { borderRadius: radius.xl };
    case "input":
      return { borderRadius: radius.lg, borderTopLeftRadius: radius.xxl, borderBottomLeftRadius: radius.xxl };
    default:
      return { borderRadius: radius.lg };
  }
}

export function GraphNodeView({ data, selected, sourcePosition = Position.Right, targetPosition = Position.Left }: NodeProps) {
  const nodeData = data as GraphNodeData;
  const nodeStatus = nodeData.status ?? "idle";
  const compileIssue = nodeData.compileIssue ?? null;
  const inspectionDimmed = nodeData.inspectionDimmed ?? false;
  const showTargetHandle = nodeData.nodeType !== "input";
  const showSourceHandle = nodeData.nodeType !== "output";
  const Icon = ICONS[nodeData.nodeType];
  const tokens = nodeTypeTokens[nodeData.nodeType];
  const handleHit = shell.touchTarget.min;
  const handleStyle: CSSProperties = {
    width: handleHit,
    height: handleHit,
    minWidth: handleHit,
    minHeight: handleHit,
    background: `radial-gradient(circle, ${tokens.accent} 0 6px, transparent 7px)`,
    border: "none",
    borderRadius: 999,
  };

  const borderColor =
    nodeStatus !== "idle"
      ? statusColor[nodeStatus]
      : selected
        ? color.primary[600]
        : compileIssue
          ? issueBorderColor(compileIssue)
          : tokens.border;

  const cardStyle: CSSProperties = {
    padding: `${spacing[4]}px`,
    ...shapeStyles(nodeData.nodeType),
    minWidth: nodeData.nodeType === "router" ? 220 : 256,
    background: tokens.bg,
    border: `2px solid ${borderColor}`,
    color: text.primary,
    opacity: inspectionDimmed ? 0.35 : 1,
    boxShadow: nodeStatus === "running" ? shadow.runningGlow : nodeTypeGlow(tokens.accent),
    fontFamily: fontFamily.ui,
    transition: "border-color 150ms, box-shadow 150ms",
    boxSizing: "border-box",
  };

  const targetHandleLabel = `Connect to ${nodeData.nodeType} node`;
  const sourceHandleLabel = `Connect from ${nodeData.nodeType} node`;

  return (
    <div style={{ position: "relative", display: "inline-block", background: "transparent", pointerEvents: "none" }}>
      {showTargetHandle && (
        <Handle
          type="target"
          position={targetPosition}
          title={targetHandleLabel}
          aria-label={targetHandleLabel}
          style={{ ...handleStyle, pointerEvents: "auto" }}
        />
      )}
      <div style={{ ...cardStyle, pointerEvents: "auto" }}>
        <div
          style={{
            ...localType.label,
            color: tokens.label,
            display: "flex",
            alignItems: "center",
            justifyContent: nodeData.nodeType === "router" ? "center" : undefined,
            gap: spacing[2],
          }}
        >
          <Icon size={16} strokeWidth={2} color={tokens.accent} aria-hidden="true" />
          <span>{nodeData.nodeType}</span>
        </div>
        <div
          style={{
            ...localType.ui,
            fontWeight: 600,
            marginTop: 2,
            textAlign: nodeData.nodeType === "router" ? "center" : undefined,
          }}
        >
          {nodeData.label}
        </div>
        {nodeStatus !== "idle" && (
          <div style={{ ...localType.micro, marginTop: spacing[1], color: statusColor[nodeStatus] }}>{nodeStatus}</div>
        )}
        {compileIssue && (
          <div
            style={{
              ...localType.micro,
              marginTop: spacing[1],
              color: compileIssue.severity === "error" ? color.error[500] : color.warning[500],
              lineHeight: "14px",
              textAlign: nodeData.nodeType === "router" ? "center" : undefined,
            }}
            title={compileIssue.caption}
          >
            {compileIssue.severity === "error" ? "Error" : "Warning"}: {truncateCaption(compileIssue.caption)}
          </div>
        )}
      </div>
      {showSourceHandle && (
        <Handle
          type="source"
          position={sourcePosition}
          title={sourceHandleLabel}
          aria-label={sourceHandleLabel}
          style={{ ...handleStyle, pointerEvents: "auto" }}
        />
      )}
    </div>
  );
}
