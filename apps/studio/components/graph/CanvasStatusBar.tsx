"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { Focus, Grid3x3, Info, Network, SquareTerminal, X } from "lucide-react";
import { EDGE_KIND_TAXONOMY } from "@/content/taxonomy";
import type { GraphStructure } from "@/lib/graphAuthoring";
import { severityCounts, useConsoleLog } from "@/lib/consoleLog";
import { GRID_SIZES, type GridSize } from "@/lib/canvasAlign";
import { DEFAULT_PATTERN, dashArray } from "@/lib/edgeStyle";
import { consoleCountsLabel } from "./CanvasConsoleDock";
import {
  color,
  radius,
  shell,
  spacing,
  surface,
  text,
  typeScale,
} from "@/lib/graph-theme";
import { HoverTooltip } from "./ui/HoverTooltip";

const EDGE_KINDS = ["sequence", "conditional", "default"] as const;
const HOP_OPTIONS = [1, 2, 3] as const;

export const STATUS_BAR_HEIGHT = 28;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function structureLabel(structure: GraphStructure): string {
  return `${plural(structure.nodes, "node")} · ${plural(structure.edges, "edge")}`;
}

function listOrNone(names: string[]): string {
  return names.length === 0 ? "none" : names.join(", ");
}

export function structureTooltip(structure: GraphStructure): string {
  return `Entry: ${listOrNone(structure.entrypoints)} · Terminal: ${listOrNone(structure.terminals)}`;
}

/**
 * The canvas's bottom status bar (canvas-workbench-ergonomics-plan.md §8):
 * graph facts and view toggles in one quiet strip, so the header can stay
 * short at laptop widths. Rendered inside FlowCanvas's ReactFlowProvider,
 * so it reads the zoom and can fit the view directly.
 */
export function CanvasStatusBar({
  structure,
  focusMode,
  focusHops,
  onFocusHopsChange,
  onExitFocus,
  focusNodeIds,
  snapToGrid,
  onSnapToGridChange,
  onFitView,
  reducedMotion = false,
  consoleOpen = false,
  onToggleConsole,
  toolLabel,
  gridSize,
  onGridSizeChange,
}: {
  structure: GraphStructure;
  focusMode: boolean;
  focusHops: number;
  onFocusHopsChange: (hops: number) => void;
  onExitFocus: () => void;
  /** The lit nodes while focus mode has a selection; empty otherwise. */
  focusNodeIds: string[];
  snapToGrid: boolean;
  onSnapToGridChange: (snap: boolean) => void;
  onFitView: () => void;
  reducedMotion?: boolean;
  /** The console dock (§6): its toggle shows the error/warning counts. */
  consoleOpen?: boolean;
  onToggleConsole?: () => void;
  /** The active pointer tool (§4), e.g. "Select". */
  toolLabel?: string;
  /** The grid step (§9), set next to the Snap toggle. */
  gridSize?: GridSize;
  onGridSizeChange?: (size: GridSize) => void;
}) {
  const reactFlow = useReactFlow();
  const zoom = useStore((state) => Math.round(state.transform[2] * 100));
  // Read here, not in GraphEditor, so a log entry re-renders only this bar.
  const consoleCounts = severityCounts(useConsoleLog());

  return (
    <div role="group" aria-label="Canvas status" style={barStyle}>
      <HoverTooltip content={structureTooltip(structure)} placement="top">
        <span
          tabIndex={0}
          className="agb-focus-ring"
          aria-label={`${structureLabel(structure)}. ${structureTooltip(structure)}`}
          style={itemStyle}
        >
          <Network size={12} aria-hidden="true" />
          <span>{structureLabel(structure)}</span>
        </span>
      </HoverTooltip>

      {onToggleConsole && (
        <HoverTooltip content={consoleOpen ? "Hide console  ⌘⇧J" : "Show console  ⌘⇧J"} placement="top">
          <button
            type="button"
            className="agb-focus-ring agb-hoverable"
            aria-expanded={consoleOpen}
            aria-label={`Console: ${consoleCountsLabel(consoleCounts) === "Console" ? "no errors or warnings" : consoleCountsLabel(consoleCounts)}`}
            onClick={onToggleConsole}
            style={{
              ...toggleStyle(consoleOpen),
              color: consoleCounts.error > 0 ? color.error[500] : consoleCounts.warning > 0 ? color.warning[500] : consoleOpen ? color.primary[500] : text.muted,
            }}
          >
            <SquareTerminal size={12} aria-hidden="true" />
            {consoleCountsLabel(consoleCounts)}
          </button>
        </HoverTooltip>
      )}

      {focusMode && (
        <div
          role="group"
          aria-label="Focus mode"
          style={{
            ...itemStyle,
            gap: 4,
            borderLeft: `1px solid ${surface.border}`,
            paddingLeft: spacing[2],
          }}
        >
          <Focus
            size={12}
            aria-hidden="true"
            style={{ color: color.primary[500] }}
          />
          <span>Focus</span>
          {HOP_OPTIONS.map((hops) => (
            <button
              key={hops}
              type="button"
              className="agb-focus-ring agb-hoverable"
              aria-pressed={focusHops === hops}
              aria-label={`${plural(hops, "hop")} around the selection`}
              onClick={() => onFocusHopsChange(hops)}
              style={segmentStyle(focusHops === hops)}
            >
              {hops}
            </button>
          ))}
          <button
            type="button"
            className="agb-focus-ring agb-hoverable"
            disabled={focusNodeIds.length === 0}
            onClick={() =>
              void reactFlow.fitView({
                nodes: focusNodeIds.map((id) => ({ id })),
                padding: 0.25,
                duration: reducedMotion ? 0 : shell.motion.drawerMs,
              })
            }
            style={textButtonStyle(focusNodeIds.length === 0)}
          >
            Fit to focus
          </button>
          <button
            type="button"
            className="agb-focus-ring agb-hoverable"
            aria-label="Exit focus mode (Esc)"
            onClick={onExitFocus}
            style={{
              ...textButtonStyle(false),
              display: "inline-flex",
              padding: 2,
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      )}

      <span style={{ flex: "1 1 auto" }} />

      {toolLabel && (
        <span data-testid="active-tool" style={{ ...itemStyle, color: text.secondary }}>
          {toolLabel} tool
        </span>
      )}
      <EdgeKindsButton />
      <button
        type="button"
        className="agb-focus-ring agb-hoverable"
        aria-pressed={snapToGrid}
        onClick={() => onSnapToGridChange(!snapToGrid)}
        style={toggleStyle(snapToGrid)}
      >
        <Grid3x3 size={12} aria-hidden="true" />
        Snap
      </button>
      {gridSize !== undefined && onGridSizeChange && (
        <select
          aria-label="Grid size"
          value={gridSize}
          onChange={(event) => onGridSizeChange(Number(event.target.value) as GridSize)}
          className="agb-focus-ring"
          style={gridSelectStyle}
        >
          {GRID_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      )}
      <HoverTooltip content="Fit view" placement="top">
        <button
          type="button"
          className="agb-focus-ring agb-hoverable"
          aria-label={`Zoom ${zoom}%. Fit view`}
          onClick={onFitView}
          style={{
            ...toggleStyle(false),
            minWidth: 44,
            justifyContent: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {zoom}%
        </button>
      </HoverTooltip>
    </div>
  );
}

/** The edge-kind legend, which used to float over the canvas, as a popover. */
function EdgeKindsButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="agb-focus-ring agb-hoverable"
        aria-expanded={open}
        aria-controls="agb-edge-kinds"
        onClick={() => setOpen((value) => !value)}
        style={toggleStyle(open)}
      >
        <Info size={12} aria-hidden="true" />
        Edge kinds
      </button>
      {open && (
        <div
          id="agb-edge-kinds"
          role="note"
          aria-label="Edge kinds"
          style={legendStyle}
        >
          {EDGE_KINDS.map((kind) => (
            <div key={kind} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              {/* The kind's default line (§7): solid, dashed, dotted. */}
              <svg width="28" height="8" aria-hidden="true" style={{ flexShrink: 0 }}>
                <line
                  x1="0"
                  y1="4"
                  x2="28"
                  y2="4"
                  stroke={text.muted}
                  strokeWidth={1.5}
                  strokeDasharray={dashArray(DEFAULT_PATTERN[kind], 1.5)}
                />
              </svg>
              <strong>{EDGE_KIND_TAXONOMY[kind].title}</strong>
              <span style={{ color: text.muted }}>
                {" "}
                {EDGE_KIND_TAXONOMY[kind].summary}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[2],
  height: STATUS_BAR_HEIGHT,
  flexShrink: 0,
  padding: `0 ${spacing[2]}px`,
  borderTop: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.muted,
  whiteSpace: "nowrap",
  // Not overflow: hidden -- the edge-kinds popover opens above the bar.
  ...typeScale.caption,
};

const itemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: radius.md,
  cursor: "default",
};

function toggleStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 22,
    padding: `0 ${spacing[1] + 2}px`,
    borderRadius: radius.md,
    border: `1px solid ${active ? surface.borderStrong : "transparent"}`,
    background: active ? surface.raised : "transparent",
    color: active ? color.primary[500] : text.muted,
    cursor: "pointer",
    ...typeScale.caption,
  };
}

function segmentStyle(active: boolean): CSSProperties {
  return {
    ...toggleStyle(active),
    width: 20,
    justifyContent: "center",
    padding: 0,
  };
}

function textButtonStyle(disabled: boolean): CSSProperties {
  return {
    ...toggleStyle(false),
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

const legendStyle: CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: "calc(100% + 6px)",
  zIndex: 30,
  display: "flex",
  flexDirection: "column",
  gap: spacing[1],
  width: 320,
  padding: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: color.neutral[900],
  color: text.primary,
  whiteSpace: "normal",
  boxShadow: shell.shadow.drawer,
  ...typeScale.caption,
};

const gridSelectStyle: CSSProperties = {
  height: 22,
  padding: "0 2px",
  borderRadius: radius.md,
  border: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.muted,
  ...typeScale.caption,
};
