"use client";

import { useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Download,
  Focus,
  GitBranch,
  HelpCircle,
  LayoutGrid,
  MoreHorizontal,
  Play,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Upload,
  XCircle,
} from "lucide-react";
import type { Diagnostic, GraphHealth, GraphOrientation } from "@bstockwelldev/agent-graph-sdk";
import { HEALTH_BAND } from "@/lib/graphHealth";
import { validationSummary } from "@/lib/diagnostics";
import { color, radius, shell, spacing, status as statusColor, surface, text, typeScale } from "@/lib/graph-theme";
import type { LayoutSpacing } from "@/layout/dagreLayout";
import type { WorkbenchPanelId } from "@/components/workbench/panels";
import { IconButton } from "./ui/IconButton";
import { HoverTooltip } from "./ui/HoverTooltip";
import { TextInput } from "./ui/fields";
import { NodeContextMenu, menuAnchorFor, type NodeContextMenuAction } from "./NodeContextMenu";

export type RunPanelSectionId = "run-controls" | "run-simulate" | "run-diagnostics" | "observe-events" | "observe-history";

type MenuId = "run" | "layout" | "overflow";

export type GraphHeaderLayoutControls = {
  orientation: GraphOrientation;
  onOrientationChange: (orientation: GraphOrientation) => void;
  onRelayout: () => void;
  onFitView: () => void;
  spacing: LayoutSpacing;
  onSpacingChange: (spacing: LayoutSpacing) => void;
  showMinimap: boolean;
  onShowMinimapChange: (show: boolean) => void;
};

const ORIENTATION_OPTIONS: { value: GraphOrientation; label: string; title: string }[] = [
  { value: "auto", label: "Auto", title: "Follows the canvas shape: vertical when the pane is portrait or narrow." },
  { value: "horizontal", label: "Horizontal", title: "Left-to-right, regardless of pane size." },
  { value: "vertical", label: "Vertical", title: "Top-to-bottom, regardless of pane size." },
];

const SPACING_OPTIONS: { value: LayoutSpacing; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "relaxed", label: "Relaxed" },
];

/**
 * Graph-first workbench header (studio-graph-workbench-redesign-plan.md,
 * Slice 2; review sections 8-12). Replaces GraphEditor's old floating HUD,
 * whose ~19 text buttons (including 5 for orientation alone) wrapped onto
 * multiple rows and swapped labels to "Close X" when toggled.
 *
 * Layout: identity + save state on the left; lifecycle actions (Validate,
 * Run▾) then compact icon tools on the right. Low-frequency actions
 * (Releases, Routing lab, Knowledge, Export/Import, Shortcuts) live in the
 * `···` overflow menu instead of occupying permanent space. Toggle state is
 * shown as a pressed/checked state, never a label swap.
 *
 * Token-styled (lib/graph-theme.ts) -- this renders inside the graph route,
 * so it must not import components/ui/* (apps/studio/AGENTS.md).
 */
export function GraphHeader({
  hudRef,
  compact,
  graphSwitcher,
  graphName,
  onGraphNameChange,
  onBack,
  dirty,
  saving,
  onSave,
  diagnostics,
  onValidate,
  activePanel,
  onTogglePanel,
  onOpenRunSection,
  focusMode,
  onToggleFocusMode,
  onOpenChat,
  layout,
  onExport,
  onImport,
  onShowShortcuts,
  health = null,
  onOpenFind,
}: {
  hudRef?: Ref<HTMLDivElement>;
  compact: boolean;
  /** The existing GraphSwitcherCombobox, rendered by the caller. */
  graphSwitcher?: ReactNode;
  graphName: string;
  onGraphNameChange: (name: string) => void;
  onBack: () => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  diagnostics: Diagnostic[];
  onValidate: () => void;
  activePanel: WorkbenchPanelId | null;
  onTogglePanel: (panel: WorkbenchPanelId) => void;
  onOpenRunSection: (section: RunPanelSectionId) => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onOpenChat: () => void;
  layout: GraphHeaderLayoutControls;
  onExport: () => void;
  onImport: () => void;
  onShowShortcuts: () => void;
  /** Wave 7a (STO-610): health score chip + find-on-canvas entry. */
  health?: Pick<GraphHealth, "score" | "band"> | null;
  onOpenFind?: () => void;
}) {
  const [menu, setMenu] = useState<{ id: MenuId; x: number; y: number } | null>(null);
  const runMenuRef = useRef<HTMLButtonElement>(null);
  const layoutMenuRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLButtonElement>(null);

  const openMenu = (id: MenuId, trigger: HTMLElement | null, align: "left" | "right" = "left") => {
    if (!trigger) return;
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const anchor = menuAnchorFor(trigger, align, MENU_WIDTH);
    setMenu({ id, ...anchor });
  };

  const summary = validationSummary(diagnostics);
  const validation = summary.errors > 0 ? "error" : summary.warnings > 0 ? "warning" : "ok";
  const validationText =
    validation === "ok" ? "Valid" : `${summary.errors > 0 ? summary.errors : summary.warnings}`;

  const runActions: NodeContextMenuAction[] = [
    { label: "Run controls", onClick: () => onOpenRunSection("run-controls") },
    { label: "Run with fixture…", onClick: () => onOpenRunSection("run-simulate") },
    { label: "Event log", onClick: () => onOpenRunSection("observe-events") },
    { label: "Run history", onClick: () => onOpenRunSection("observe-history") },
    { label: "Diagnostics", onClick: () => onOpenRunSection("run-diagnostics"), separatorBefore: true },
  ];

  const layoutActions: NodeContextMenuAction[] = [
    { label: "Auto-arrange now", onClick: layout.onRelayout },
    { label: "Fit view", onClick: layout.onFitView },
    ...ORIENTATION_OPTIONS.map((option, index) => ({
      label: option.label,
      title: option.title,
      checked: layout.orientation === option.value,
      separatorBefore: index === 0,
      groupLabel: index === 0 ? "Direction" : undefined,
      onClick: () => layout.onOrientationChange(option.value),
    })),
    ...SPACING_OPTIONS.map((option, index) => ({
      label: option.label,
      checked: layout.spacing === option.value,
      separatorBefore: index === 0,
      groupLabel: index === 0 ? "Spacing" : undefined,
      onClick: () => layout.onSpacingChange(option.value),
    })),
    {
      label: "Show minimap",
      checked: layout.showMinimap,
      separatorBefore: true,
      onClick: () => layout.onShowMinimapChange(!layout.showMinimap),
    },
  ];

  const overflowActions: NodeContextMenuAction[] = [
    ...(compact
      ? [
          { label: "Layout: auto-arrange", onClick: layout.onRelayout },
          { label: "Focus mode", checked: focusMode, onClick: onToggleFocusMode },
        ]
      : []),
    {
      label: "Releases",
      icon: <Tag size={14} />,
      checked: activePanel === "releases",
      separatorBefore: compact,
      onClick: () => onTogglePanel("releases"),
    },
    {
      label: "Routing lab",
      icon: <GitBranch size={14} />,
      checked: activePanel === "routingLab",
      onClick: () => onTogglePanel("routingLab"),
    },
    {
      label: "Knowledge",
      icon: <BookOpen size={14} />,
      checked: activePanel === "knowledge",
      onClick: () => onTogglePanel("knowledge"),
    },
    {
      label: "Policies",
      icon: <ShieldCheck size={14} />,
      checked: activePanel === "policies",
      onClick: () => onTogglePanel("policies"),
    },
    ...(onOpenFind ? [{ label: "Find on canvas", icon: <Search size={14} />, shortcut: "⌘F", separatorBefore: true, onClick: onOpenFind }] : []),
    {
      label: health ? `Health · ${health.score}` : "Health",
      icon: <Activity size={14} />,
      checked: activePanel === "health",
      separatorBefore: !onOpenFind,
      onClick: () => onTogglePanel("health"),
    },
    { label: "Export JSON", icon: <Download size={14} />, separatorBefore: true, onClick: onExport },
    { label: "Import JSON…", icon: <Upload size={14} />, onClick: onImport },
    { label: "Shortcuts", icon: <HelpCircle size={14} />, shortcut: "?", separatorBefore: true, onClick: onShowShortcuts },
  ];

  const saveStateLabel = saving ? "Saving…" : dirty ? "Unsaved" : "Saved";
  const saveDotColor = saving ? statusColor.running : dirty ? color.warning[500] : statusColor.succeeded;

  return (
    <div ref={hudRef} role="toolbar" aria-label="Graph" className="glass-panel ghost-border" style={headerStyle}>
      {/* Identity */}
      <div style={{ ...groupStyle, minWidth: 0, flex: "1 1 auto" }}>
        <IconButton label="All graphs" icon={<ChevronLeft size={18} />} onClick={onBack} />
        {!compact && graphSwitcher}
        <TextInput
          value={graphName}
          onChange={(event) => onGraphNameChange(event.target.value)}
          aria-label="Graph name"
          className="agb-inline-input agb-focus-ring"
          style={nameInputStyle}
        />
        <HoverTooltip content={dirty ? "You have unsaved changes" : saving ? "Saving…" : "All changes saved"}>
          <span role="status" aria-live="polite" style={saveStateStyle}>
            <span
              aria-hidden="true"
              className={saving ? "agb-pulse" : undefined}
              style={{ width: 8, height: 8, borderRadius: 999, background: saveDotColor, flexShrink: 0 }}
            />
            {!compact && saveStateLabel}
          </span>
        </HoverTooltip>
        <IconButton
          label="Save"
          shortcut="⌘S"
          icon={<Save size={16} />}
          disabled={!dirty || saving}
          onClick={onSave}
        />
      </div>

      {/* Lifecycle */}
      <div style={groupStyle}>
        <HoverTooltip
          content={validation === "ok" ? "No validation issues — click to re-validate" : `${summary.label} — click to review`}
        >
          <button
            type="button"
            onClick={onValidate}
            className="agb-focus-ring agb-hoverable"
            aria-label={`Validate graph (${summary.label})`}
            style={validateChipStyle(validation)}
          >
            {validation === "ok" ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : validation === "warning" ? (
              <AlertTriangle size={14} aria-hidden="true" />
            ) : (
              <XCircle size={14} aria-hidden="true" />
            )}
            <span>{validationText}</span>
          </button>
        </HoverTooltip>
        {health && !compact && (
          <HoverTooltip content={`Graph health: ${HEALTH_BAND[health.band].label} — click for the breakdown`}>
            <button
              type="button"
              onClick={() => onTogglePanel("health")}
              className="agb-focus-ring agb-hoverable"
              aria-label={`Graph health ${health.score} of 100 (${HEALTH_BAND[health.band].label})`}
              aria-pressed={activePanel === "health"}
              style={{ ...validateChipStyle("ok"), color: HEALTH_BAND[health.band].color, borderColor: HEALTH_BAND[health.band].color }}
            >
              <Activity size={14} aria-hidden="true" />
              <span>{health.score}</span>
            </button>
          </HoverTooltip>
        )}
        {!compact && (
          <div style={{ display: "inline-flex" }}>
            <IconButton
              label={activePanel === "run" ? "Hide run panel" : "Run"}
              text="Run"
              tone="primary"
              icon={<Play size={14} />}
              pressed={activePanel === "run"}
              onClick={() => onTogglePanel("run")}
              style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            />
            <IconButton
              ref={runMenuRef}
              label="Run options"
              tone="primary"
              icon={<ChevronDown size={14} />}
              aria-haspopup="menu"
              aria-expanded={menu?.id === "run"}
              onClick={() => openMenu("run", runMenuRef.current, "right")}
              style={{ minWidth: 24, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftColor: color.primary[800] }}
            />
          </div>
        )}
      </div>

      {/* Tools */}
      <div style={{ ...groupStyle, paddingLeft: spacing[2], borderLeft: `1px solid ${surface.border}` }}>
        {!compact && (
          <>
            <IconButton
              label="Add node"
              icon={<Plus size={18} />}
              pressed={activePanel === "palette"}
              onClick={() => onTogglePanel("palette")}
            />
            <IconButton
              ref={layoutMenuRef}
              label="Layout"
              icon={<LayoutGrid size={16} />}
              aria-haspopup="menu"
              aria-expanded={menu?.id === "layout"}
              pressed={menu?.id === "layout"}
              onClick={() => openMenu("layout", layoutMenuRef.current, "right")}
            />
            <IconButton
              label={focusMode ? "Focus mode: on" : "Focus mode"}
              icon={<Focus size={16} />}
              pressed={focusMode}
              onClick={onToggleFocusMode}
            />
            <IconButton label="Chat about this graph" shortcut="⌘⇧C" icon={<Sparkles size={16} />} onClick={onOpenChat} />
          </>
        )}
        <IconButton
          ref={overflowMenuRef}
          label="More actions"
          icon={<MoreHorizontal size={18} />}
          aria-haspopup="menu"
          aria-expanded={menu?.id === "overflow"}
          pressed={menu?.id === "overflow" || activePanel === "releases" || activePanel === "routingLab" || activePanel === "knowledge" || activePanel === "policies" || activePanel === "health"}
          onClick={() => openMenu("overflow", overflowMenuRef.current, "right")}
        />
      </div>

      {menu && (
        <NodeContextMenu
          x={menu.x}
          y={menu.y}
          width={MENU_WIDTH}
          title={menu.id === "run" ? "Run" : menu.id === "layout" ? "Layout" : "More"}
          actions={menu.id === "run" ? runActions : menu.id === "layout" ? layoutActions : overflowActions}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

const MENU_WIDTH = 240;

const headerStyle: CSSProperties = {
  position: "absolute",
  left: spacing[3],
  right: spacing[3],
  top: spacing[3],
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  gap: spacing[2],
  minHeight: shell.headerHeight,
  padding: `${spacing[1]}px ${spacing[2]}px`,
  borderRadius: radius.xl,
  border: "1px solid",
  color: text.primary,
};

const groupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[1],
  flexShrink: 0,
};

const nameInputStyle: CSSProperties = {
  flex: "0 1 280px",
  minWidth: 80,
  width: "auto",
  fontWeight: 600,
  fontSize: 14,
  padding: `4px ${spacing[2]}px`,
};

const saveStateStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: `0 ${spacing[1]}px`,
  whiteSpace: "nowrap",
  color: text.muted,
  ...typeScale.caption,
};

function validateChipStyle(state: "ok" | "warning" | "error"): CSSProperties {
  const tone = state === "ok" ? color.success[500] : state === "warning" ? color.warning[500] : color.error[500];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 32,
    padding: `0 10px`,
    borderRadius: 999,
    border: `1px solid ${surface.borderStrong}`,
    background: "transparent",
    color: tone,
    cursor: "pointer",
    whiteSpace: "nowrap",
    ...typeScale.caption,
    fontWeight: 600,
  };
}
