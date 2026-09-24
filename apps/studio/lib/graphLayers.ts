import type { Edge, Node } from "@xyflow/react";
import type { GraphLayer, NodeMetrics, NodeType } from "@bstockwelldev/agent-graph-sdk";

import { layoutNodesWithDagre } from "@/layout/dagreLayout";
import { NODE_CARD_MAX_HEIGHT, NODE_CARD_WIDTH } from "@/layout/nodeGeometry";
import { GROUP_COLORS, type GroupColorId } from "./graphGroups";

/**
 * Views and architecture layers (large-graph complexity, Wave 7d /
 * STO-622). Layers are display-only: `graph.layers` plus each node's
 * `extensions.layer`. Everything here is pure; GraphEditor derives the
 * Layers and Heatmap renderings from it without touching saved positions.
 */

export type GraphView = "canvas" | "overview" | "layers" | "heatmap";
export const GRAPH_VIEWS: { value: GraphView; label: string }[] = [
  { value: "canvas", label: "Canvas" },
  { value: "overview", label: "Overview" },
  { value: "layers", label: "Layers" },
  { value: "heatmap", label: "Heatmap" },
];

export function parseGraphView(raw: string | null | undefined): GraphView {
  return GRAPH_VIEWS.some((view) => view.value === raw) ? (raw as GraphView) : "canvas";
}

export const UNASSIGNED_LAYER = "__unassigned__";

export const DEFAULT_LAYERS: GraphLayer[] = [
  { id: "ingress", label: "Ingress", color: "blue" },
  { id: "reasoning", label: "Reasoning", color: "violet" },
  { id: "tools", label: "Tools", color: "amber" },
  { id: "egress", label: "Egress", color: "green" },
];

export function layerColor(layer: Pick<GraphLayer, "color">): string {
  return GROUP_COLORS[(layer.color ?? "slate") as GroupColorId] ?? GROUP_COLORS.slate;
}

/** "Auto-assign by type": entry and exit points, tool-ish nodes, and the
 * reasoning in between. */
export function autoAssignLayer(type: NodeType): string {
  if (type === "input") return "ingress";
  if (type === "output") return "egress";
  if (type === "tool" || type === "tool_loop" || type === "code_exec") return "tools";
  return "reasoning";
}

type LayerNode = Pick<Node, "id"> & { data: { nodeType: NodeType; extensions?: Record<string, unknown> } };

/** The node's layer id, or UNASSIGNED_LAYER when unset or undefined. */
export function layerOf(node: LayerNode, layers: GraphLayer[]): string {
  const raw = node.data.extensions?.layer;
  return typeof raw === "string" && layers.some((layer) => layer.id === raw) ? raw : UNASSIGNED_LAYER;
}

/** `extensions` with `layer` set, or removed (null) -- `undefined` when
 * nothing else is left, like nodeDefaults' withUserLabel. */
export function withLayer(extensions: Record<string, unknown> | null | undefined, layer: string | null): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...(extensions ?? {}) };
  if (layer) next.layer = layer;
  else delete next.layer;
  return Object.keys(next).length > 0 ? next : undefined;
}

export const LANE_LABEL_WIDTH = 140;
const COLUMN_GAP = 72;
const ROW_GAP = 28;
const LANE_PADDING = 28;

export type Lane = { id: string; label: string; color: string; y: number; height: number; width: number; count: number };

/**
 * Swimlanes: one horizontal band per layer (plus "Unassigned" when needed),
 * top to bottom in `layers` order. Columns come from a left-to-right dagre
 * pass over the whole graph, so a node sits at its topological rank;
 * nodes sharing a lane and a column stack. Hidden lanes are dropped.
 */
export function laneLayout<T extends LayerNode & Pick<Node, "position">>(
  nodes: T[],
  edges: Edge[],
  layers: GraphLayer[],
  hidden: ReadonlySet<string> = new Set(),
): { positions: Map<string, { x: number; y: number }>; lanes: Lane[] } {
  const ranked = layoutNodesWithDagre(nodes as unknown as Node[], edges, "LR");
  const xs = [...new Set(ranked.map((node) => Math.round(node.position.x)))].sort((a, b) => a - b);
  const columnOf = new Map(ranked.map((node) => [node.id, xs.indexOf(Math.round(node.position.x))]));
  const columns = Math.max(1, xs.length);

  const laneDefs = [
    ...layers.map((layer) => ({ id: layer.id, label: layer.label, color: layerColor(layer) })),
    { id: UNASSIGNED_LAYER, label: "Unassigned", color: GROUP_COLORS.slate },
  ];
  const positions = new Map<string, { x: number; y: number }>();
  const lanes: Lane[] = [];
  let y = 0;
  for (const def of laneDefs) {
    if (hidden.has(def.id)) continue;
    const members = nodes.filter((node) => layerOf(node, layers) === def.id);
    if (members.length === 0 && def.id === UNASSIGNED_LAYER) continue;
    const stacks = new Map<number, number>();
    for (const node of members) {
      const column = columnOf.get(node.id) ?? 0;
      const row = stacks.get(column) ?? 0;
      stacks.set(column, row + 1);
      positions.set(node.id, {
        x: LANE_LABEL_WIDTH + column * (NODE_CARD_WIDTH + COLUMN_GAP),
        y: y + LANE_PADDING + row * (NODE_CARD_MAX_HEIGHT + ROW_GAP),
      });
    }
    const rows = Math.max(1, ...stacks.values());
    const height = LANE_PADDING * 2 + rows * NODE_CARD_MAX_HEIGHT + (rows - 1) * ROW_GAP;
    lanes.push({
      ...def,
      y,
      height,
      width: LANE_LABEL_WIDTH + columns * (NODE_CARD_WIDTH + COLUMN_GAP),
      count: members.length,
    });
    y += height + 12;
  }
  return { positions, lanes };
}

// ------------------------------------------------------------ heatmap

export type HeatMetric = "p95" | "failure_rate" | "executions";
export const HEAT_METRICS: { value: HeatMetric; label: string }[] = [
  { value: "p95", label: "p95 latency" },
  { value: "failure_rate", label: "Failure rate" },
  { value: "executions", label: "Executions" },
];

/** The metric's raw value for one node, or null when it has no data. */
export function heatValue(metric: HeatMetric, metrics: NodeMetrics | undefined): number | null {
  if (!metrics || metrics.executions === 0) return null;
  if (metric === "executions") return metrics.executions;
  if (metric === "failure_rate") return metrics.failed / metrics.executions;
  return metrics.p95_duration_ms ?? null;
}

export function formatHeat(metric: HeatMetric, value: number): string {
  if (metric === "failure_rate") return `${Math.round(value * 100)}%`;
  if (metric === "executions") return `${value}×`;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

// Sequential ramp: calm (low) -> warning -> error (high). Stops are the
// graph-theme success/warning/error 500s.
const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [0x3c, 0xb8, 0x73]],
  [0.5, [0xe8, 0xbc, 0x4a]],
  [1, [0xe2, 0x64, 0x5a]],
];

/** Colour for `value` relative to `max` (0 when max is 0). */
export function heatColor(value: number, max: number): string {
  const t = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const upper = HEAT_STOPS.findIndex(([stop]) => stop >= t);
  const [s1, c1] = HEAT_STOPS[Math.max(0, upper - 1)];
  const [s2, c2] = HEAT_STOPS[Math.max(0, upper)];
  const f = s2 === s1 ? 0 : (t - s1) / (s2 - s1);
  const mix = c1.map((c, i) => Math.round(c + (c2[i] - c) * f));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

export type NodeHeat = { value: number; label: string; color: string };

/** Per-node heat for the whole graph; nodes without data are absent. */
export function heatByNode(metric: HeatMetric, nodeMetrics: NodeMetrics[]): Map<string, NodeHeat> {
  const values = nodeMetrics
    .map((metrics) => [metrics.node_id, heatValue(metric, metrics)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== null);
  const max = Math.max(0, ...values.map(([, value]) => value));
  return new Map(values.map(([id, value]) => [id, { value, label: formatHeat(metric, value), color: heatColor(value, max) }]));
}
