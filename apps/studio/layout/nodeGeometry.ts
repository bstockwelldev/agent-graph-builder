/**
 * Node card geometry -- the single source of truth shared by the card
 * renderer (components/graph/nodes/GraphNodeView.tsx) and the layout
 * engine (layout/dagreLayout.ts). Review section 21: "the design system
 * should expose measurable node geometry rather than maintaining arbitrary
 * duplicated dimensions."
 *
 * The card enforces these rather than growing to fit content: its width is
 * fixed, every text row is single-line with ellipsis, and the running
 * indicator is an overlay rather than an extra row -- so its rendered box
 * never exceeds NODE_CARD_WIDTH x NODE_CARD_MAX_HEIGHT, and dagre's
 * non-overlap guarantee (which only holds for the box size it's told)
 * holds for the real card too. Previously dagre assumed 280x160 while the
 * card only had a minWidth, so a long model name or template grew the
 * card past its layout box and it overlapped its neighbor.
 */
export const NODE_CARD_WIDTH = 264;
export const NODE_CARD_MAX_HEIGHT = 124;

export type NodeBox = { x: number; y: number; width: number; height: number };

export function nodeBoxAt(position: { x: number; y: number }): NodeBox {
  return { x: position.x, y: position.y, width: NODE_CARD_WIDTH, height: NODE_CARD_MAX_HEIGHT };
}

export function boxesOverlap(a: NodeBox, b: NodeBox, gap = 0): boolean {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}
