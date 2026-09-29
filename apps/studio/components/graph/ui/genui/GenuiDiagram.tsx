"use client";

import { useId, useMemo } from "react";
import dagre from "@dagrejs/dagre";

import { border, fontFamily, spacing, surface, text, typeScale } from "@/lib/graph-theme";

/**
 * A GenUI Diagram: a Mermaid flowchart subset, laid out with dagre and drawn
 * as SVG (no Mermaid runtime, no raw HTML). Supported:
 *   graph TD | LR | TB | RL | BT   (or `flowchart …`)
 *   A[Rect]  B(Rounded)  C{Decision}  D((Circle))
 *   A --> B   A --- B   A -.-> B   A ==> B   A -->|label| B   A --> B --> C
 * Anything else is reported rather than guessed.
 */
type Shape = "rect" | "round" | "diamond" | "circle";
type DiagramNode = { id: string; label: string; shape: Shape };
type DiagramEdge = { from: string; to: string; label?: string; style: "solid" | "dotted" | "thick"; arrow: boolean };
export type ParsedDiagram = { direction: "TB" | "LR" | "BT" | "RL"; nodes: DiagramNode[]; edges: DiagramEdge[] };

const NODE = /^([A-Za-z0-9_]+)(?:\(\((.+?)\)\)|\[(.+?)\]|\((.+?)\)|\{(.+?)\})?$/;
const LINK = /^(-->|---|-\.->|==>)(?:\|([^|]*)\|)?$/;

function parseNode(token: string): DiagramNode | null {
  const match = token.trim().match(NODE);
  if (!match) return null;
  const [, id, circle, rect, round, diamond] = match;
  const shape: Shape = circle ? "circle" : rect ? "rect" : round ? "round" : diamond ? "diamond" : "rect";
  return { id, label: (circle ?? rect ?? round ?? diamond ?? id).replace(/^"|"$/g, ""), shape };
}

export function parseDiagram(source: string): ParsedDiagram {
  const lines = source
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));
  const header = lines.shift()?.match(/^(?:graph|flowchart)\s+(TD|TB|LR|RL|BT)$/i);
  if (!header) throw new Error('Start with "graph TD" or "graph LR" (a Mermaid flowchart).');
  const direction = (header[1].toUpperCase() === "TD" ? "TB" : header[1].toUpperCase()) as ParsedDiagram["direction"];
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const addNode = (node: DiagramNode) => {
    const existing = nodes.get(node.id);
    // A later bare mention keeps the earlier label and shape.
    if (!existing || node.label !== node.id) nodes.set(node.id, node);
  };

  for (const [index, line] of lines.entries()) {
    // Split into node / link tokens: links are the arrow operators, optionally with |label|.
    const parts = line.split(/\s*(-->(?:\|[^|]*\|)?|---(?:\|[^|]*\|)?|-\.->(?:\|[^|]*\|)?|==>(?:\|[^|]*\|)?)\s*/).filter((part) => part !== "");
    const first = parseNode(parts[0] ?? "");
    if (!first) throw new Error(`Line ${index + 2}: can't read "${line}".`);
    addNode(first);
    let previous = first;
    for (let i = 1; i < parts.length; i += 2) {
      const link = parts[i].match(LINK);
      const next = parseNode(parts[i + 1] ?? "");
      if (!link || !next) throw new Error(`Line ${index + 2}: can't read "${line}".`);
      addNode(next);
      edges.push({
        from: previous.id,
        to: next.id,
        label: link[2]?.trim() || undefined,
        style: link[1] === "-.->" ? "dotted" : link[1] === "==>" ? "thick" : "solid",
        arrow: link[1] !== "---",
      });
      previous = next;
    }
  }
  if (nodes.size === 0) throw new Error("The diagram has no nodes.");
  if (nodes.size > 60) throw new Error("Diagrams are limited to 60 nodes.");
  return { direction, nodes: [...nodes.values()], edges };
}

const CHAR = 7;
const PAD_X = 16;
const NODE_H = 36;

function layout(diagram: ParsedDiagram) {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: diagram.direction, nodesep: 28, ranksep: 44, marginx: 8, marginy: 8 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of diagram.nodes) {
    const width = Math.min(220, Math.max(56, node.label.length * CHAR + PAD_X * 2));
    graph.setNode(node.id, { width: node.shape === "diamond" ? width + 24 : width, height: node.shape === "diamond" ? NODE_H + 16 : NODE_H });
  }
  diagram.edges.forEach((edge, index) =>
    graph.setEdge(edge.from, edge.to, { label: edge.label, width: edge.label ? edge.label.length * CHAR : 0, height: edge.label ? 16 : 0 }, String(index)),
  );
  dagre.layout(graph);
  const size = graph.graph() as { width?: number; height?: number };
  return { graph, width: Math.ceil(size.width ?? 0), height: Math.ceil(size.height ?? 0) };
}

export function GenuiDiagram({ source, title }: { source: string; title?: string }) {
  const markerId = `genui-arrow-${useId().replace(/:/g, "")}`;
  const result = useMemo(() => {
    try {
      const diagram = parseDiagram(source);
      return { diagram, ...layout(diagram), error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) } as const;
    }
  }, [source]);

  if (result.error !== null) {
    return (
      <div>
        <p role="alert" style={{ ...typeScale.caption, color: text.secondary, margin: 0 }}>
          Diagram: {result.error}
        </p>
      </div>
    );
  }
  const { diagram, graph, width, height } = result;
  const summary = `${title ?? "Diagram"}: ${diagram.nodes.length} steps. ${diagram.edges
    .map((edge) => `${labelOf(diagram, edge.from)} to ${labelOf(diagram, edge.to)}${edge.label ? ` (${edge.label})` : ""}`)
    .join("; ")}.`;

  return (
    <figure style={{ margin: 0 }}>
      {title ? <figcaption style={{ ...typeScale.small, color: text.primary, marginBottom: spacing[1] }}>{title}</figcaption> : null}
      {/* Focusable so a wide diagram can be scrolled from the keyboard. */}
      <div tabIndex={0} role="region" aria-label={title ?? "Diagram"} className="agb-focus-ring" style={{ overflowX: "auto" }}>
        <svg role="img" aria-label={summary} width={width} height={height} style={{ display: "block", fontFamily: fontFamily.ui, maxWidth: "none" }}>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={text.secondary} />
            </marker>
          </defs>
          {diagram.edges.map((edge, index) => {
            const data = graph.edge({ v: edge.from, w: edge.to, name: String(index) }) as { points: { x: number; y: number }[]; x?: number; y?: number };
            const d = data.points.map((point, i) => `${i === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
            return (
              <g key={index}>
                <path
                  d={d}
                  fill="none"
                  stroke={text.secondary}
                  strokeWidth={edge.style === "thick" ? 2.5 : 1.25}
                  strokeDasharray={edge.style === "dotted" ? "4 4" : undefined}
                  markerEnd={edge.arrow ? `url(#${markerId})` : undefined}
                />
                {edge.label && data.x !== undefined && data.y !== undefined ? (
                  <text x={data.x} y={data.y} dy="0.32em" textAnchor="middle" fontSize={11} fill={text.secondary} stroke={surface.inset} strokeWidth={4} paintOrder="stroke">
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {diagram.nodes.map((node) => {
            const box = graph.node(node.id) as { x: number; y: number; width: number; height: number };
            const left = box.x - box.width / 2;
            const top = box.y - box.height / 2;
            const shared = { fill: surface.card, stroke: border.default, strokeWidth: 1 };
            return (
              <g key={node.id}>
                {node.shape === "diamond" ? (
                  <polygon points={`${box.x},${top} ${left + box.width},${box.y} ${box.x},${top + box.height} ${left},${box.y}`} {...shared} />
                ) : node.shape === "circle" ? (
                  <ellipse cx={box.x} cy={box.y} rx={box.width / 2} ry={box.height / 2} {...shared} />
                ) : (
                  <rect x={left} y={top} width={box.width} height={box.height} rx={node.shape === "round" ? box.height / 2 : 4} {...shared} />
                )}
                <text x={box.x} y={box.y} dy="0.32em" textAnchor="middle" fontSize={12} fill={text.primary}>
                  {truncate(node.label, Math.floor((box.width - PAD_X) / CHAR))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

function labelOf(diagram: ParsedDiagram, id: string) {
  return diagram.nodes.find((node) => node.id === id)?.label ?? id;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value;
}
