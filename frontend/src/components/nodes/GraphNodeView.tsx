import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, GitBranch, LogIn, LogOut, PenLine, Wrench, type LucideIcon } from "lucide-react";
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
}

export function GraphNodeView({ data, selected }: NodeProps) {
  const nodeData = data as GraphNodeData;
  const nodeStatus = nodeData.status ?? "idle";
  const showTargetHandle = nodeData.nodeType !== "input";
  const showSourceHandle = nodeData.nodeType !== "output";
  const Icon = ICONS[nodeData.nodeType];

  return (
    <div
      style={{
        borderRadius: radius.lg,
        padding: `${spacing[3]}px ${spacing[4]}px`,
        minWidth: 150,
        background: surface.raised,
        border: `2px solid ${selected ? color.primary[600] : statusColor[nodeStatus]}`,
        color: text.primary,
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
      {showSourceHandle && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
