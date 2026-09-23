"use client";

import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { color, radius, shell, surface, text } from "@/lib/graph-theme";
import { HoverTooltip } from "./HoverTooltip";

export type IconButtonTone = "default" | "primary" | "destructive";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name AND tooltip text -- required, since the icon alone
   * never names the control (review section 11). */
  label: string;
  icon: ReactNode;
  /** Toggle state: sets aria-pressed and a raised surface. Omit for plain actions. */
  pressed?: boolean;
  tone?: IconButtonTone;
  /** 32px default; "touch" meets shell.touchTarget.min (44px) for compact layouts. */
  size?: "default" | "touch";
  /** Optional shortcut hint appended to the tooltip, e.g. "⌘S". */
  shortcut?: string;
  tooltipPlacement?: "top" | "bottom";
  /** Extra visible text beside the icon (e.g. a split-button's "Run"). */
  text?: string;
}

/**
 * Token-styled icon button for the graph kit
 * (studio-graph-workbench-redesign-plan.md, Slice 1). Every graph-route
 * icon control goes through this, so each one gets an accessible name, a
 * tooltip, a visible focus ring, and a consistent pressed state -- replacing
 * the shadcn Button that GraphEditor's HUD used to import in violation of
 * apps/studio/AGENTS.md's "never mix the two styling systems" rule.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, pressed, tone = "default", size = "default", shortcut, tooltipPlacement, text: visibleText, style, className, ...props },
  ref,
) {
  const dimension = size === "touch" ? shell.touchTarget.min : 32;
  const toneStyle: CSSProperties =
    tone === "primary"
      ? { background: color.primary[700], borderColor: color.primary[600], color: text.primary }
      : tone === "destructive"
        ? { background: "transparent", borderColor: "transparent", color: color.error[500] }
        : pressed
          ? { background: surface.raised, borderColor: surface.borderStrong, color: color.primary[500] }
          : { background: "transparent", borderColor: "transparent", color: text.primary };

  return (
    <HoverTooltip content={shortcut ? `${label}  ${shortcut}` : label} placement={tooltipPlacement}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        className={["agb-focus-ring", tone === "primary" ? "" : "agb-hoverable", className].filter(Boolean).join(" ")}
        {...props}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          minWidth: dimension,
          height: dimension,
          padding: visibleText ? "0 10px" : 0,
          borderRadius: radius.lg,
          border: "1px solid",
          cursor: props.disabled ? "not-allowed" : "pointer",
          opacity: props.disabled ? 0.45 : 1,
          fontSize: 13,
          fontWeight: 600,
          lineHeight: "18px",
          whiteSpace: "nowrap",
          transition: `background ${shell.motion.fast}ms, color ${shell.motion.fast}ms`,
          ...toneStyle,
          ...style,
        }}
      >
        {icon}
        {visibleText && <span>{visibleText}</span>}
      </button>
    </HoverTooltip>
  );
});
