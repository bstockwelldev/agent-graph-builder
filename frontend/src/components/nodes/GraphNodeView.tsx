import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, GitBranch, LogIn, LogOut, PenLine, Wrench, type LucideIcon } from "lucide-react";
import type { CompileIssue } from "../../diagnostics";
import type { NodeType } from "../../types";
import { color, fontFamily, localType, radius, shadow, spacing, status as statusColor, surface, text } from "../../theme";

const ICONS: Record<NodeType, LucideIcon> = {
  input: LogIn,
  prompt: PenLine,
  llm: Bot,
  tool: Wrench,
  router: GitBranch,
  output: LogOut,
};

export interface GraphNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  label: string;
  config: Record<string, unknown>;
  status?: "idle" | "running" | "succeeded" | "failed";
  compileIssue?: CompileIssue | null;
  inspectionDimmed?: boolean;
}

function issueBorderColor(issue: CompileIssue | null | undefined): string {
  if (issue?.severity === "error") return color.error[600];
  if (issue?.severity === "warning") return color.warning[600];
  return statusColor.idle;
}

function truncateCaption(caption: string, max = 42): string {
  return caption.length > max ? `${caption.slice(0, max - 1)}…` : caption;
}

export function GraphNodeView({ data, selected }: NodeProps) {
  const nodeData = data as GraphNodeData;
  const nodeStatus = nodeData.status ?? "idle";
  const compileIssue = nodeData.compileIssue ?? null;
  const inspectionDimmed = nodeData.inspectionDimmed ?? false;
  const showTargetHandle = nodeData.nodeType !== "input";
  const showSourceHandle = nodeData.nodeType !== "output";
  const Icon = ICONS[nodeData.nodeType];

  const borderColor =
    nodeStatus !== "idle"
      ? statusColor[nodeStatus]
      : selected
        ? color.primary[600]
        : issueBorderColor(compileIssue);

  return (
    <div
      style={{
        borderRadius: radius.lg,
        padding: `${spacing[3]}px ${spacing[4]}px`,
        minWidth: 150,
        background: surface.raised,
        border: `2px solid ${borderColor}`,
        color: text.primary,
        opacity: inspectionDimmed ? 0.35 : 1,
        boxShadow: nodeStatus === "running" ? shadow.runningGlow : shadow.none,
        fontFamily: fontFamily.ui,
        transition: "border-color 150ms, box-shadow 150ms",
      }}
    >
      {showTargetHandle && <Handle type="target" position={Position.Left} />}
      <div style={{ ...localType.label, opacity: 0.6, display: "flex", alignItems: "center", gap: spacing[1] }}>
        <Icon size={12} strokeWidth={2} />
        <span>{nodeData.nodeType}</span>
      </div>
      <div style={{ ...localType.ui, fontWeight: 600, marginTop: 2 }}>{nodeData.label}</div>
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
          }}
          title={compileIssue.caption}
        >
          {compileIssue.severity === "error" ? "Error" : "Warning"}: {truncateCaption(compileIssue.caption)}
        </div>
      )}
      {showSourceHandle && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
