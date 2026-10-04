"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { LineageGraph, LineageGraphNode } from "@bstockwelldev/agent-graph-sdk";

import { LINEAGE_NODE_HEIGHT, LINEAGE_NODE_WIDTH, describeLineageNode, layoutLineageGraph } from "@/lib/lineageGraph";
import { fontFamily, nodeType, radius, surface, text, typeScale } from "@/lib/graph-theme";

// The Knowledge panel's lineage picture: documents → chunks → runs → nodes,
// top to bottom. Boxes for runs and nodes are buttons (open the run, or the
// node's Run tab); documents and chunks explain themselves on hover.

const LOOK: Record<LineageGraphNode["kind"], { bg: string; border: string; label: string }> = {
  document: nodeType.input,
  chunk: nodeType.prompt,
  run: nodeType.output,
  node: nodeType.llm,
};

export function LineageGraphView({
  graph,
  onOpenRun,
  onOpenNode,
}: {
  graph: LineageGraph;
  onOpenRun?: (runId: string) => void;
  onOpenNode?: (runId: string, nodeId: string) => void;
}) {
  const layout = useMemo(() => layoutLineageGraph(graph), [graph]);
  return (
    <div
      role="group"
      aria-label="Lineage graph"
      style={{ overflow: "auto", maxHeight: 420, border: `1px solid ${surface.border}`, borderRadius: radius.lg, background: surface.inset }}
    >
      <div style={{ position: "relative", width: layout.width, height: layout.height }}>
        <svg width={layout.width} height={layout.height} aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
          {layout.edges.map((edge) => (
            <polyline
              key={`${edge.source}-${edge.target}-${edge.kind}`}
              points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke={text.muted}
              strokeOpacity={edge.kind === "retrieved" && edge.score !== null ? 0.35 + 0.65 * Math.max(0, Math.min(1, edge.score)) : 0.5}
              strokeWidth={edge.kind === "retrieved" ? 1.5 : 1}
              strokeDasharray={edge.kind === "contains" ? "3 3" : undefined}
            >
              {edge.score !== null && <title>{`score ${edge.score.toFixed(2)}`}</title>}
            </polyline>
          ))}
        </svg>
        {layout.nodes.map((node) => {
          const description = describeLineageNode(node);
          const meta = node.meta ?? {};
          const runId = typeof meta.runId === "string" ? meta.runId : null;
          const action =
            node.kind === "run" && runId && onOpenRun
              ? () => onOpenRun(runId)
              : node.kind === "node" && runId && onOpenNode
                ? () => onOpenNode(runId, String(meta.nodeId))
                : null;
          const style = boxStyle(node, layout.nodes.indexOf(node));
          return action ? (
            <button
              key={node.id}
              type="button"
              className="agb-focus-ring agb-hoverable"
              aria-label={`${description}: open`}
              title={description}
              onClick={action}
              style={{ ...style, cursor: "pointer" }}
            >
              {node.label}
            </button>
          ) : (
            <div key={node.id} role="img" aria-label={description} title={description} style={style}>
              {node.label}
            </div>
          );
        })}
      </div>
    </div>
  );

  function boxStyle(node: LineageGraphNode, index: number): CSSProperties {
    const positioned = layout.nodes[index];
    const look = LOOK[node.kind];
    return {
      position: "absolute",
      left: positioned.x,
      top: positioned.y,
      width: LINEAGE_NODE_WIDTH,
      height: LINEAGE_NODE_HEIGHT,
      boxSizing: "border-box",
      padding: "0 8px",
      display: "flex",
      alignItems: "center",
      borderRadius: radius.md,
      border: `1px solid ${look.border}`,
      background: look.bg,
      color: look.label,
      ...typeScale.caption,
      fontFamily: node.kind === "run" || node.kind === "node" ? fontFamily.mono : undefined,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      textAlign: "left",
    };
  }
}
