"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Ported from apps/playground's ShellDrawer.tsx (studio-consolidation Phase
// 7), restyled to studio's glass-panel/ghost-border Tailwind classes instead
// of playground's inline surface.panel/shell.shadow.drawer styles. Collapses
// the graph editor's floating palette/run/library panels into a slide-in
// drawer at compact/phone viewport widths (see useShellLayout).
export function ShellDrawer({
  open,
  onClose,
  side,
  title,
  drawerId,
  reducedMotion,
  panelWidth = "min(340px, 92vw)",
  children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title: string;
  drawerId: string;
  reducedMotion: boolean;
  panelWidth?: string;
  children: ReactNode;
}) {
  if (!open) return null;

  const panelStyle: CSSProperties = {
    width: panelWidth,
    transition: reducedMotion ? undefined : "transform 200ms ease-in-out",
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="fixed inset-0 z-40 border-none bg-black/45"
      />
      <aside
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={panelStyle}
        className={cn(
          "glass-panel ghost-border fixed top-0 bottom-0 z-50 flex max-w-full flex-col border",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
        )}
      >
        <div className="ghost-border flex shrink-0 items-center justify-between border-b p-3">
          <div className="text-sm font-semibold">{title}</div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={`Close ${title}`}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
