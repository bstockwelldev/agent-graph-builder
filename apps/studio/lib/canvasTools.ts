// Canvas pointer tools (canvas-workbench-ergonomics-plan.md §4): Figma's
// keys where they exist. Each tool maps to React Flow's interaction props;
// Connect and Zoom also change what a click does (GraphEditor, FlowCanvas).

export type CanvasTool = "select" | "hand" | "marquee" | "connect" | "zoom";

export const CANVAS_TOOLS: {
  id: CanvasTool;
  label: string;
  key: string;
  hint: string;
}[] = [
  {
    id: "select",
    label: "Select",
    key: "V",
    hint: "Click to select, drag nodes, drag the canvas to pan",
  },
  {
    id: "hand",
    label: "Hand",
    key: "H",
    hint: "Drag anywhere to pan (or hold Space)",
  },
  {
    id: "marquee",
    label: "Marquee",
    key: "M",
    hint: "Drag a box to select the nodes it touches",
  },
  {
    id: "connect",
    label: "Connect",
    key: "C",
    hint: "Click a source node, then a target",
  },
  {
    id: "zoom",
    label: "Zoom",
    key: "Z",
    hint: "Click to zoom in, Alt-click to zoom out",
  },
];

/** The tool a bare key press picks, if any. */
export function toolForKey(key: string): CanvasTool | null {
  const upper = key.toUpperCase();
  return CANVAS_TOOLS.find((tool) => tool.key === upper)?.id ?? null;
}

export function toolLabel(tool: CanvasTool): string {
  return CANVAS_TOOLS.find((candidate) => candidate.id === tool)?.label ?? tool;
}

export type FlowInteraction = {
  /** true: left drag pans; an array: only those mouse buttons pan. */
  panOnDrag: boolean | number[];
  selectionOnDrag: boolean;
  nodesDraggable: boolean;
};

/** React Flow's interaction props for a tool; holding Space is a temporary Hand. */
export function flowInteraction(
  tool: CanvasTool,
  spaceHeld = false,
): FlowInteraction {
  const effective = spaceHeld ? "hand" : tool;
  switch (effective) {
    case "hand":
      return {
        panOnDrag: true,
        selectionOnDrag: false,
        nodesDraggable: false,
      };
    case "marquee":
      // Middle and right buttons still pan.
      return {
        panOnDrag: [1, 2],
        selectionOnDrag: true,
        nodesDraggable: true,
      };
    case "connect":
      return {
        panOnDrag: true,
        selectionOnDrag: false,
        nodesDraggable: false,
      };
    case "zoom":
      return {
        panOnDrag: false,
        selectionOnDrag: false,
        nodesDraggable: false,
      };
    default:
      return {
        panOnDrag: true,
        selectionOnDrag: false,
        nodesDraggable: true,
      };
  }
}

/**
 * The viewport after zooming by `factor` around a screen point, so the
 * point under the cursor stays put (Zoom tool clicks).
 */
export function zoomAround(
  viewport: { x: number; y: number; zoom: number },
  point: { x: number; y: number },
  factor: number,
  limits: { min: number; max: number },
): { x: number; y: number; zoom: number } {
  const zoom = Math.min(
    limits.max,
    Math.max(limits.min, viewport.zoom * factor),
  );
  const scale = zoom / viewport.zoom;
  return {
    zoom,
    x: point.x - (point.x - viewport.x) * scale,
    y: point.y - (point.y - viewport.y) * scale,
  };
}
