// Snapping and alignment (canvas-workbench-ergonomics-plan.md §9): smart
// guides while dragging, Align and Distribute for a multi-selection, and
// grid rounding for positions the canvas computes. Pure functions over node
// boxes in flow coordinates; positions aren't part of a graph's fingerprint.

export type Box = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type Point = { x: number; y: number };

export type AlignMode =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export const GRID_SIZES = [12, 24, 48] as const;
export type GridSize = (typeof GRID_SIZES)[number];
export const DEFAULT_GRID: GridSize = 24;
/** Within this many flow pixels, a dragged node snaps to a guide. */
export const GUIDE_THRESHOLD = 6;

export function isGridSize(value: unknown): value is GridSize {
  return GRID_SIZES.includes(value as GridSize);
}

export function snapToGrid(point: Point, grid: number): Point {
  return {
    x: Math.round(point.x / grid) * grid,
    y: Math.round(point.y / grid) * grid,
  };
}

/**
 * New top-left positions lining the boxes up on one edge or center of their
 * shared bounding box (Figma's Align). Fewer than two boxes: no change.
 */
export function alignBoxes(
  boxes: Box[],
  mode: AlignMode,
): Record<string, Point> {
  if (boxes.length < 2) return {};
  const left = Math.min(...boxes.map((box) => box.x));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const top = Math.min(...boxes.map((box) => box.y));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const result: Record<string, Point> = {};
  for (const box of boxes) {
    let { x, y } = box;
    if (mode === "left") x = left;
    else if (mode === "right") x = right - box.width;
    else if (mode === "center") x = (left + right) / 2 - box.width / 2;
    else if (mode === "top") y = top;
    else if (mode === "bottom") y = bottom - box.height;
    else y = (top + bottom) / 2 - box.height / 2;
    result[box.id] = { x, y };
  }
  return result;
}

/**
 * Equal gaps between the boxes along an axis, keeping the two outermost in
 * place (Figma's Distribute). Fewer than three boxes: no change.
 */
export function distributeBoxes(
  boxes: Box[],
  axis: DistributeAxis,
): Record<string, Point> {
  if (boxes.length < 3) return {};
  const horizontal = axis === "horizontal";
  const start = (box: Box) => (horizontal ? box.x : box.y);
  const size = (box: Box) => (horizontal ? box.width : box.height);
  const sorted = [...boxes].sort((a, b) => start(a) - start(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = start(last) + size(last) - start(first);
  const gap =
    (span - sorted.reduce((sum, box) => sum + size(box), 0)) /
    (sorted.length - 1);
  const result: Record<string, Point> = {};
  let cursor = start(first);
  for (const box of sorted) {
    result[box.id] = horizontal
      ? { x: cursor, y: box.y }
      : { x: box.x, y: cursor };
    cursor += size(box) + gap;
  }
  return result;
}

/** A guide line in flow coordinates: vertical at `x = at`, or horizontal at `y = at`. */
export type Guide = {
  orientation: "vertical" | "horizontal";
  at: number;
  from: number;
  to: number;
};

/**
 * Snap a dragged box to the nearest edge or center of another box, per axis,
 * within `threshold`. Returns the adjusted position and the guides to draw.
 */
export function snapToGuides(
  moving: Box,
  others: Box[],
  threshold = GUIDE_THRESHOLD,
): { position: Point; guides: Guide[] } {
  const xLines = (box: Box) => [
    box.x,
    box.x + box.width / 2,
    box.x + box.width,
  ];
  const yLines = (box: Box) => [
    box.y,
    box.y + box.height / 2,
    box.y + box.height,
  ];
  let bestX: { diff: number; at: number; other: Box } | null = null;
  let bestY: { diff: number; at: number; other: Box } | null = null;
  for (const other of others) {
    if (other.id === moving.id) continue;
    for (const target of xLines(other)) {
      for (const line of xLines(moving)) {
        const diff = target - line;
        if (
          Math.abs(diff) <= threshold &&
          (!bestX || Math.abs(diff) < Math.abs(bestX.diff))
        )
          bestX = { diff, at: target, other };
      }
    }
    for (const target of yLines(other)) {
      for (const line of yLines(moving)) {
        const diff = target - line;
        if (
          Math.abs(diff) <= threshold &&
          (!bestY || Math.abs(diff) < Math.abs(bestY.diff))
        )
          bestY = { diff, at: target, other };
      }
    }
  }
  const position = {
    x: moving.x + (bestX?.diff ?? 0),
    y: moving.y + (bestY?.diff ?? 0),
  };
  const placed = { ...moving, ...position };
  const guides: Guide[] = [];
  if (bestX) {
    guides.push({
      orientation: "vertical",
      at: bestX.at,
      from: Math.min(placed.y, bestX.other.y),
      to: Math.max(
        placed.y + placed.height,
        bestX.other.y + bestX.other.height,
      ),
    });
  }
  if (bestY) {
    guides.push({
      orientation: "horizontal",
      at: bestY.at,
      from: Math.min(placed.x, bestY.other.x),
      to: Math.max(placed.x + placed.width, bestY.other.x + bestY.other.width),
    });
  }
  return { position, guides };
}
