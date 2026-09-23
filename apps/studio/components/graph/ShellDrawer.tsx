"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { IconButton } from "./ui/IconButton";

// Ported from apps/playground's ShellDrawer.tsx (studio-consolidation Phase
// 7). Collapses the graph editor's panels into a slide-in modal drawer at
// compact/phone widths (see useShellLayout).
//
// Wave 3 (studio-graph-workbench-redesign-plan.md, "Motion +
// accessibility"): it slides in from its edge and back out (`closing`, kept
// mounted by the caller's usePresence -- it used to return null the instant
// it closed, so its transition never ran), traps focus while open, starts
// focus on the close button, and returns focus to the opener on close.
// The close control is the graph kit's IconButton rather than shadcn's
// Button (apps/studio/AGENTS.md: never mix the two styling systems).
export function ShellDrawer({
  open,
  closing = false,
  onClose,
  side,
  title,
  drawerId,
  panelWidth = "min(340px, 92vw)",
  children,
}: {
  open: boolean;
  /** Playing the exit animation; still mounted but no longer interactive. */
  closing?: boolean;
  onClose: () => void;
  side: "left" | "right";
  title: string;
  drawerId: string;
  /** Unused: motion is CSS-driven and honours prefers-reduced-motion globally. */
  reducedMotion?: boolean;
  panelWidth?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, open && !closing);

  if (!open && !closing) return null;

  const panelStyle: CSSProperties = { width: panelWidth };
  const closingAttr = closing ? { "data-closing": "" } : {};

  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        tabIndex={-1}
        onClick={onClose}
        className="agb-backdrop fixed inset-0 z-40 border-none bg-black/45"
        {...closingAttr}
      />
      <aside
        ref={panelRef}
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-workbench-drawer=""
        data-graph-surface=""
        tabIndex={-1}
        inert={closing || undefined}
        onKeyDown={(event: KeyboardEvent) => {
          // The drawer is modal: Escape always closes it unless something
          // inside (a menu, a combobox) already handled the key.
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            onClose();
          }
        }}
        style={panelStyle}
        className={cn(
          "glass-panel ghost-border fixed top-0 bottom-0 z-50 flex max-w-full flex-col border outline-none",
          side === "left" ? "agb-drawer-left left-0 border-r" : "agb-drawer-right right-0 border-l",
        )}
        {...closingAttr}
      >
        <div className="ghost-border flex shrink-0 items-center justify-between border-b py-2 pr-2 pl-3">
          <div className="text-sm font-semibold">{title}</div>
          <IconButton label={`Close ${title}`} icon={<X size={16} />} onClick={onClose} data-autofocus="" tooltipPlacement="bottom" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
