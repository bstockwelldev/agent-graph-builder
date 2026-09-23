"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { radius, shadow, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";

const VIEWPORT_MARGIN = spacing[2];
const GAP = 6;

/**
 * Token-styled hover/focus tooltip for the graph kit
 * (studio-graph-workbench-redesign-plan.md, Slice 1; review section 11:
 * "the icon is the control, the tooltip is the explanation").
 *
 * Unlike TaxonomyTooltip (a help popover that renders its own info button),
 * this wraps any existing control. It's a label, not interactive content:
 * it never takes focus, and it dismisses on Escape, pointer-leave, or blur.
 * Controls must still carry their own accessible name (IconButton passes
 * `label` as aria-label) -- the tooltip is linked via aria-describedby only
 * when its text adds something beyond that name.
 */
export function HoverTooltip({
  content,
  children,
  placement = "bottom",
  delayMs = 400,
  disabled = false,
  describe = false,
}: {
  content: ReactNode;
  children: ReactNode;
  placement?: "top" | "bottom";
  delayMs?: number;
  disabled?: boolean;
  /** Link the tooltip to the wrapped control via aria-describedby. */
  describe?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const tooltipId = useId();

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = useCallback(() => {
    if (disabled) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(true), delayMs);
  }, [delayMs, disabled]);

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, []);

  useEffect(() => clearTimer, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = tooltip?.offsetWidth ?? 160;
    const height = tooltip?.offsetHeight ?? 28;
    let top = placement === "top" ? rect.top - height - GAP : rect.bottom + GAP;
    if (placement === "bottom" && top + height > window.innerHeight - VIEWPORT_MARGIN) {
      top = rect.top - height - GAP;
    } else if (placement === "top" && top < VIEWPORT_MARGIN) {
      top = rect.bottom + GAP;
    }
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN));
    setPosition({ top, left });
  }, [open, placement, content]);

  return (
    <span
      ref={anchorRef}
      style={{ display: "inline-flex" }}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      onPointerDown={hide}
      aria-describedby={describe && open ? tooltipId : undefined}
    >
      {children}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={{
              ...tooltipStyle,
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              visibility: position ? "visible" : "hidden",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

const tooltipStyle: CSSProperties = {
  position: "fixed",
  zIndex: shell.zIndex.tooltip + 1,
  maxWidth: 280,
  padding: `${spacing[1]}px ${spacing[2]}px`,
  borderRadius: radius.md,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.panel,
  color: text.primary,
  boxShadow: shadow[2],
  pointerEvents: "none",
  whiteSpace: "normal",
  ...typeScale.caption,
};
