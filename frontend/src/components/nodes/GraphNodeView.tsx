import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeType } from "../../types";

const ICONS: Record<NodeType, string> = {
  input: "→□",
  prompt: "✎",
  llm: "◈",
  tool: "⚙",
  router: "⥂",
  output: "□→",
};

const STATUS_COLOR: Record<string, string> = {
  idle: "#3a3f4b",
  running: "#d8a92c",
  succeeded: "#2f9e5c",
  failed: "#d1453b",
};

export interface GraphNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  label: string;
  config: Record<string, unknown>;
  status?: "idle" | "running" | "succeeded" | "failed";
}

export function GraphNodeView({ data, selected }: NodeProps) {
  const nodeData = data as GraphNodeData;
  const status = nodeData.status ?? "idle";
  const showTargetHandle = nodeData.nodeType !== "input";
  const showSourceHandle = nodeData.nodeType !== "output";

  return (
    <div
      style={{
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 150,
        background: "#20232b",
        border: `2px solid ${selected ? "#6ea8fe" : STATUS_COLOR[status]}`,
        color: "#e8eaed",
        boxShadow: status === "running" ? "0 0 10px rgba(216,169,44,0.6)" : "none",
        fontFamily: "system-ui, sans-serif",
        transition: "border-color 150ms, box-shadow 150ms",
      }}
    >
      {showTargetHandle && <Handle type="target" position={Position.Left} />}
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.6 }}>
        {ICONS[nodeData.nodeType]} {nodeData.nodeType}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{nodeData.label}</div>
      {status !== "idle" && (
        <div style={{ fontSize: 10, marginTop: 4, color: STATUS_COLOR[status] }}>{status}</div>
      )}
      {showSourceHandle && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
