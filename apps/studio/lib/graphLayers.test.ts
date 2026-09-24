import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeMetrics } from "@bstockwelldev/agent-graph-sdk";

import {
  DEFAULT_LAYERS,
  LANE_LABEL_WIDTH,
  UNASSIGNED_LAYER,
  autoAssignLayer,
  heatByNode,
  heatColor,
  heatValue,
  laneLayout,
  layerOf,
  parseGraphView,
  withLayer,
} from "./graphLayers";

// Wave 7d (STO-622): views and architecture layers.

const node = (id: string, nodeType: string, layer?: string) =>
  ({ id, position: { x: 0, y: 0 }, data: { nodeType, extensions: layer ? { layer } : undefined } }) as unknown as Node<{
    nodeType: "llm";
    extensions?: Record<string, unknown>;
  }>;
const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

describe("layer assignment", () => {
  it("auto-assigns by type and reads layers, treating unknown ids as unassigned", () => {
    expect(["input", "prompt", "tool", "code_exec", "output", "subgraph"].map((t) => autoAssignLayer(t as never))).toEqual([
      "ingress",
      "reasoning",
      "tools",
      "tools",
      "egress",
      "reasoning",
    ]);
    expect(layerOf(node("a", "llm", "tools"), DEFAULT_LAYERS)).toBe("tools");
    expect(layerOf(node("a", "llm", "gone"), DEFAULT_LAYERS)).toBe(UNASSIGNED_LAYER);
    expect(withLayer({ label: "x" }, "tools")).toEqual({ label: "x", layer: "tools" });
    expect(withLayer({ layer: "tools" }, null)).toBeUndefined();
    expect(parseGraphView("layers")).toBe("layers");
    expect(parseGraphView("bogus")).toBe("canvas");
  });
});

describe("laneLayout", () => {
  const nodes = [node("in", "input", "ingress"), node("p", "prompt", "reasoning"), node("t", "tool", "tools"), node("x", "llm"), node("out", "output", "egress")];
  const edges = [edge("in", "p"), edge("p", "t"), edge("t", "out"), edge("p", "x")];

  it("stacks lanes in layer order and places nodes by rank", () => {
    const { positions, lanes } = laneLayout(nodes, edges, DEFAULT_LAYERS);
    expect(lanes.map((lane) => lane.id)).toEqual(["ingress", "reasoning", "tools", "egress", UNASSIGNED_LAYER]);
    expect(lanes.map((lane) => lane.count)).toEqual([1, 1, 1, 1, 1]);
    const x = (id: string) => positions.get(id)!.x;
    expect(x("in")).toBe(LANE_LABEL_WIDTH);
    expect(x("in") < x("p") && x("p") < x("t") && x("t") < x("out")).toBe(true);
    // Each node sits inside its own lane band.
    for (const lane of lanes) {
      const member = nodes.find((n) => layerOf(n, DEFAULT_LAYERS) === lane.id)!;
      const y = positions.get(member.id)!.y;
      expect(y).toBeGreaterThanOrEqual(lane.y);
      expect(y).toBeLessThan(lane.y + lane.height);
    }
  });

  it("drops hidden lanes and their nodes", () => {
    const { positions, lanes } = laneLayout(nodes, edges, DEFAULT_LAYERS, new Set(["tools"]));
    expect(lanes.map((lane) => lane.id)).not.toContain("tools");
    expect(positions.has("t")).toBe(false);
  });
});

describe("heatmap", () => {
  const metrics = (node_id: string, executions: number, failed: number, p95: number | null) =>
    ({ node_id, node_type: "llm", executions, succeeded: executions - failed, failed, success_rate: null, avg_duration_ms: null, p95_duration_ms: p95, last_run_id: null, last_run_at: null, last_error: null }) as NodeMetrics;

  it("computes values, leaves no-data nodes out, and scales colours to the max", () => {
    expect(heatValue("failure_rate", metrics("a", 4, 1, 10))).toBe(0.25);
    expect(heatValue("p95", metrics("a", 0, 0, null))).toBeNull();
    const heat = heatByNode("p95", [metrics("slow", 2, 0, 2000), metrics("fast", 2, 0, 100), metrics("idle", 0, 0, null)]);
    expect([...heat.keys()]).toEqual(["slow", "fast"]);
    expect(heat.get("slow")).toMatchObject({ label: "2.0s", color: heatColor(1, 1) });
    expect(heat.get("fast")?.label).toBe("100ms");
    expect(heatColor(0, 1)).toBe("rgb(60, 184, 115)");
  });
});
