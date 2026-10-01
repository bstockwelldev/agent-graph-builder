"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import {
  Hand,
  MousePointer2,
  Spline,
  SquareDashedMousePointer,
  ZoomIn,
} from "lucide-react";
import { CANVAS_TOOLS, type CanvasTool } from "@/lib/canvasTools";
import { radius, spacing, surface } from "@/lib/graph-theme";
import { IconButton } from "./ui/IconButton";

const TOOL_ICONS: Record<CanvasTool, typeof Hand> = {
  select: MousePointer2,
  hand: Hand,
  marquee: SquareDashedMousePointer,
  connect: Spline,
  zoom: ZoomIn,
};

/**
 * The canvas tool bar (canvas-workbench-ergonomics-plan.md §4): a vertical
 * strip at the canvas's left edge, Figma-style. Arrow keys move between
 * tools; each tool's letter picks it from anywhere on the canvas.
 */
export function CanvasToolbar({
  tool,
  spaceHeld,
  top,
  onToolChange,
}: {
  tool: CanvasTool;
  /** Space held: the Hand shows as active while it lasts. */
  spaceHeld: boolean;
  top: number;
  onToolChange: (tool: CanvasTool) => void;
}) {
  const active = spaceHeld ? "hand" : tool;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? (index + 1) % buttons.length
        : (index - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
      className="glass-panel ghost-border"
      style={{ ...stripStyle, top }}
    >
      {CANVAS_TOOLS.map((option) => {
        const Icon = TOOL_ICONS[option.id];
        return (
          <IconButton
            key={option.id}
            label={`${option.label} tool`}
            shortcut={option.id === "hand" ? "H · Space" : option.key}
            icon={<Icon size={16} />}
            pressed={active === option.id}
            tooltipPlacement="bottom"
            title={option.hint}
            onClick={() => onToolChange(option.id)}
          />
        );
      })}
    </div>
  );
}

const stripStyle: CSSProperties = {
  position: "absolute",
  left: spacing[3],
  zIndex: 16,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: 4,
  borderRadius: radius.lg,
  border: `1px solid ${surface.border}`,
  pointerEvents: "auto",
};
