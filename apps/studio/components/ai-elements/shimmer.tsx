import type { CSSProperties } from "react";
import { radius } from "@/lib/graph-theme";

/**
 * Minimal "assistant is typing" indicator (studio-consolidation Phase 8 part
 * E) — MUI's `shimmer.tsx` animates text via `motion/react`, a dependency
 * this repo doesn't have. Reuses the existing `.agb-skeleton` shimmer CSS
 * (globals.css, ported in Phase 7) instead of adding a new animation.
 */
export function Shimmer({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      className="agb-skeleton"
      style={{ height: 16, width: 96, borderRadius: radius.md, ...style }}
    />
  );
}
