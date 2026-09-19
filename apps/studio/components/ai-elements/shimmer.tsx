import { cn } from "@/lib/utils";

/**
 * Minimal "assistant is typing" indicator (studio-consolidation Phase 8 part
 * E) — MUI's `shimmer.tsx` animates text via `motion/react`, a dependency
 * this repo doesn't have. Reuses the existing `.agb-skeleton` shimmer CSS
 * (globals.css, ported in Phase 7) instead of adding a new animation.
 */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("agb-skeleton h-4 w-24 rounded", className)} aria-hidden />;
}
