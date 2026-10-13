"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { border, radius, shadow, surface, text } from "@/lib/graph-theme";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * A centred modal in the canvas's own styling: the panel surface, the subtle
 * border and the elevation scale from lib/graph-theme.ts, so it reads as part
 * of the graph editor rather than as a form page. Escape and a click on the
 * backdrop close it; focus is trapped inside while it is open and handed back
 * on close.
 *
 * The first element marked `data-autofocus` takes focus (else the first
 * focusable one). A nested confirm that is itself a modal should live outside
 * this one's focus trap, or be inline.
 */
export function Modal({
  open,
  onClose,
  label,
  width = 640,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The dialog's accessible name. */
  label: string;
  /** Max width in px; it never exceeds the viewport less a gutter. */
  width?: number;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 40, border: 0, padding: 0, background: "rgba(6, 8, 12, 0.62)", cursor: "default" }}
      />
      {/* A centring wrapper, so the pop-in animation's transform doesn't fight a translate(-50%). */}
      <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", padding: 16 }}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className="agb-pop"
          style={{
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            maxWidth: width,
            maxHeight: "85vh",
            background: surface.panel,
            color: text.primary,
            border: `1px solid ${border.subtle}`,
            borderRadius: radius.xl,
            boxShadow: shadow[8],
            outline: "none",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
