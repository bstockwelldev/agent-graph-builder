import type { EdgeKind } from "@bstockwelldev/agent-graph-sdk";
import { color, nodeType } from "@/lib/graph-theme";

// Edge styles (canvas-workbench-ergonomics-plan.md §7): a display-only
// `extensions.style` on an edge -- line pattern, weight and color. The
// fingerprints ignore it, so restyling never changes what runs. Each kind
// has a default pattern so the line carries meaning before anyone styles it.
// Red stays "failed" and animation stays "executing": the palette has no red,
// and validation and run states draw over a user's color.

export type EdgePattern = "solid" | "dashed" | "dotted";
export type EdgeWeight = "thin" | "normal" | "thick";
export type EdgeColor = "slate" | "blue" | "teal" | "violet" | "pink" | "green";
export type EdgeRouting = "curved" | "step" | "straight";
export type EdgeStyle = { pattern?: EdgePattern; weight?: EdgeWeight; color?: EdgeColor; routing?: EdgeRouting };

/** How the line travels between ports: the default curve, right angles, or a straight line. */
export const EDGE_ROUTINGS: { value: EdgeRouting; label: string }[] = [
  { value: "curved", label: "Curved" },
  { value: "step", label: "Step" },
  { value: "straight", label: "Straight" },
];

export const EDGE_PATTERNS: { value: EdgePattern; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

export const EDGE_WEIGHTS: { value: EdgeWeight; label: string; width: number }[] = [
  { value: "thin", label: "Thin", width: 1 },
  { value: "normal", label: "Normal", width: 1.5 },
  { value: "thick", label: "Thick", width: 3 },
];

export const EDGE_COLORS: { value: EdgeColor; label: string; stroke: string }[] = [
  { value: "slate", label: "Slate", stroke: color.neutral[100] },
  { value: "blue", label: "Blue", stroke: color.primary[500] },
  { value: "teal", label: "Teal", stroke: nodeType.input.accent },
  { value: "violet", label: "Violet", stroke: nodeType.prompt.accent },
  { value: "pink", label: "Pink", stroke: nodeType.router.accent },
  { value: "green", label: "Green", stroke: color.success[500] },
];

/** Each kind's pattern until someone picks one: Always solid, Match text dashed, Fallback dotted. */
export const DEFAULT_PATTERN: Record<EdgeKind, EdgePattern> = {
  sequence: "solid",
  conditional: "dashed",
  default: "dotted",
};

const isOneOf = <T extends string>(options: { value: T }[], value: unknown): value is T =>
  options.some((option) => option.value === value);

/** The style stored on an edge's extensions, ignoring anything malformed. */
export function readEdgeStyle(extensions: Record<string, unknown> | null | undefined): EdgeStyle {
  const raw = extensions?.style;
  if (!raw || typeof raw !== "object") return {};
  const style = raw as Record<string, unknown>;
  return {
    ...(isOneOf(EDGE_PATTERNS, style.pattern) ? { pattern: style.pattern } : {}),
    ...(isOneOf(EDGE_WEIGHTS, style.weight) ? { weight: style.weight } : {}),
    ...(isOneOf(EDGE_COLORS, style.color) ? { color: style.color } : {}),
    ...(isOneOf(EDGE_ROUTINGS, style.routing) ? { routing: style.routing } : {}),
  };
}

/** Extensions with the style set (or removed when empty); null when nothing is left. */
export function withEdgeStyle(
  extensions: Record<string, unknown> | null | undefined,
  style: EdgeStyle,
): Record<string, unknown> | null {
  const rest = { ...extensions };
  delete rest.style;
  const cleaned = Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined));
  const next = Object.keys(cleaned).length > 0 ? { ...rest, style: cleaned } : rest;
  return Object.keys(next).length > 0 ? next : null;
}

/** An SVG stroke-dasharray for a pattern at a stroke width. */
export function dashArray(pattern: EdgePattern, width: number): string | undefined {
  if (pattern === "dashed") return `${Math.round(width * 5)} ${Math.round(width * 4)}`;
  if (pattern === "dotted") return `${Math.max(1, Math.round(width))} ${Math.round(width * 3)}`;
  return undefined;
}

/**
 * The stroke an edge draws with: the user's style over the kind's defaults.
 * `baseWidth` and `baseStroke` come from the kind (and a validation issue);
 * an issue keeps its color and width, so a user style can't hide it.
 */
export function resolveEdgeLook(
  kind: EdgeKind,
  style: EdgeStyle,
  base: { stroke?: string; strokeWidth?: number },
  hasIssue = false,
): { stroke?: string; strokeWidth: number; strokeDasharray?: string } {
  const pattern = style.pattern ?? DEFAULT_PATTERN[kind];
  const userWidth = EDGE_WEIGHTS.find((weight) => weight.value === style.weight)?.width;
  const strokeWidth = hasIssue ? base.strokeWidth ?? 1.5 : userWidth ?? base.strokeWidth ?? 1.5;
  const userStroke = EDGE_COLORS.find((option) => option.value === style.color)?.stroke;
  return {
    stroke: hasIssue ? base.stroke : userStroke ?? base.stroke,
    strokeWidth,
    strokeDasharray: dashArray(pattern, strokeWidth),
  };
}
