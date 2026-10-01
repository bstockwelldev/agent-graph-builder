import type { EdgeKind, NodeType } from "@bstockwelldev/agent-graph-sdk";
import { EDGE_KIND_TAXONOMY, NODE_TYPE_TAXONOMY } from "@/content/taxonomy";
import type { AlignMode, DistributeAxis } from "@/lib/canvasAlign";
import { EDGE_COLORS, EDGE_PATTERNS, EDGE_WEIGHTS, type EdgeStyle } from "@/lib/edgeStyle";
import type { NodeContextMenuAction } from "./NodeContextMenu";

// The canvas right-click menus, one builder per target
// (canvas-workbench-ergonomics-plan.md §3). GraphEditor supplies the
// handlers; the builders own the labels, order, grouping and shortcut
// hints, so every target's menu reads the same way and is unit-testable.

/** Node types in the "Add node" submenus, grouped like a palette. */
export const NODE_TYPE_GROUPS: { label: string; types: NodeType[] }[] = [
  { label: "Flow", types: ["input", "output", "router", "branch", "subgraph"] },
  { label: "Model", types: ["prompt", "llm", "tool_loop"] },
  { label: "Data and tools", types: ["tool", "transform", "code_exec"] },
  { label: "Checks and review", types: ["guardrail", "rubric", "human_gate"] },
];

const EDGE_KINDS: EdgeKind[] = ["sequence", "conditional", "default"];

/** Node types as menu items, with a caption per group. */
export function nodeTypeItems(
  onPick: (type: NodeType) => void,
): NodeContextMenuAction[] {
  return NODE_TYPE_GROUPS.flatMap((group, groupIndex) =>
    group.types.map((type, index) => ({
      label: NODE_TYPE_TAXONOMY[type].title,
      title: NODE_TYPE_TAXONOMY[type].summary,
      separatorBefore: index === 0 && groupIndex > 0,
      groupLabel: index === 0 ? group.label : undefined,
      onClick: () => onPick(type),
    })),
  );
}

export type PaneMenuHandlers = {
  addNode: (type: NodeType) => void;
  /** Null when there is nothing to paste. */
  paste: (() => void) | null;
  selectAll: () => void;
  autoArrange: () => void;
  fitView: () => void;
  snapToGrid: boolean;
  setSnapToGrid: (snap: boolean) => void;
};

export function paneMenuActions(
  handlers: PaneMenuHandlers,
): NodeContextMenuAction[] {
  return [
    {
      label: "Add node",
      submenu: nodeTypeItems(handlers.addNode),
      onClick: () => undefined,
    },
    {
      label: "Paste",
      shortcut: "⌘V",
      disabled: handlers.paste === null,
      onClick: () => handlers.paste?.(),
    },
    { label: "Select all", shortcut: "⌘A", onClick: handlers.selectAll },
    {
      label: "Auto-arrange",
      separatorBefore: true,
      onClick: handlers.autoArrange,
    },
    { label: "Fit view", onClick: handlers.fitView },
    {
      label: "Snap to grid",
      checked: handlers.snapToGrid,
      onClick: () => handlers.setSnapToGrid(!handlers.snapToGrid),
    },
  ];
}

export type NodeMenuHandlers = {
  edit: () => void;
  runFromHere: () => void;
  rename: () => void;
  duplicate: () => void;
  copy: () => void;
  cut: () => void;
  showDependencies: (direction: "upstream" | "downstream" | "both") => void;
  focusOnNode: () => void;
  /** Group, ungroup and extract items, built by the caller. */
  groupActions: NodeContextMenuAction[];
  /** Align and Distribute, when the node is part of a multi-selection. */
  arrange?: ArrangeHandlers;
  remove: () => void;
};

export function nodeMenuActions(
  handlers: NodeMenuHandlers,
): NodeContextMenuAction[] {
  return [
    { label: "Edit configuration", onClick: handlers.edit },
    { label: "Run from here", onClick: handlers.runFromHere },
    { label: "Rename", onClick: handlers.rename },
    { label: "Duplicate node", onClick: handlers.duplicate },
    {
      label: "Copy",
      shortcut: "⌘C",
      separatorBefore: true,
      onClick: handlers.copy,
    },
    { label: "Cut", shortcut: "⌘X", onClick: handlers.cut },
    {
      label: "Show upstream",
      separatorBefore: true,
      onClick: () => handlers.showDependencies("upstream"),
    },
    {
      label: "Show downstream",
      onClick: () => handlers.showDependencies("downstream"),
    },
    {
      label: "Show all dependencies",
      onClick: () => handlers.showDependencies("both"),
    },
    { label: "Focus on this node", onClick: handlers.focusOnNode },
    ...handlers.groupActions,
    ...(handlers.arrange ? arrangeActions(handlers.arrange) : []),
    {
      label: "Delete node",
      shortcut: "⌫",
      tone: "destructive",
      separatorBefore: true,
      onClick: handlers.remove,
    },
  ];
}

export type EdgeMenuHandlers = {
  kind: EdgeKind;
  edit: () => void;
  setKind: (kind: EdgeKind) => void;
  insertNode: (type: NodeType) => void;
  remove: () => void;
  /** The edge's display-only style (§7) and how to change it. */
  style: EdgeStyle;
  setStyle: (style: EdgeStyle) => void;
};

export function edgeMenuActions(
  handlers: EdgeMenuHandlers,
): NodeContextMenuAction[] {
  return [
    { label: "Edit edge", onClick: handlers.edit },
    {
      label: "Kind",
      onClick: () => undefined,
      submenu: EDGE_KINDS.map((kind) => ({
        label: EDGE_KIND_TAXONOMY[kind].title,
        title: EDGE_KIND_TAXONOMY[kind].summary,
        checked: handlers.kind === kind,
        onClick: () => handlers.setKind(kind),
      })),
    },
    {
      label: "Style",
      onClick: () => undefined,
      submenu: edgeStyleItems(handlers.style, handlers.setStyle),
    },
    {
      label: "Insert node",
      submenu: nodeTypeItems(handlers.insertNode),
      onClick: () => undefined,
    },
    {
      label: "Delete edge",
      shortcut: "⌫",
      tone: "destructive",
      separatorBefore: true,
      onClick: handlers.remove,
    },
  ];
}

export type SelectionMenuHandlers = {
  count: number;
  group: () => void;
  extract: () => void;
  arrange: ArrangeHandlers;
  copy: () => void;
  cut: () => void;
  remove: () => void;
};

export function selectionMenuActions(
  handlers: SelectionMenuHandlers,
): NodeContextMenuAction[] {
  return [
    { label: "Group selection", shortcut: "⌘G", onClick: handlers.group },
    { label: "Extract selection to graph…", onClick: handlers.extract },
    ...arrangeActions(handlers.arrange),
    {
      label: "Copy",
      shortcut: "⌘C",
      separatorBefore: true,
      onClick: handlers.copy,
    },
    { label: "Cut", shortcut: "⌘X", onClick: handlers.cut },
    {
      label: `Delete ${handlers.count} node${handlers.count === 1 ? "" : "s"}`,
      tone: "destructive",
      separatorBefore: true,
      onClick: handlers.remove,
    },
  ];
}

// --- Align and Distribute (canvas-workbench-ergonomics-plan.md §9) ---------

export type ArrangeHandlers = {
  count: number;
  align: (mode: AlignMode) => void;
  distribute: (axis: DistributeAxis) => void;
};

/** Figma's shortcuts (⌥ + key); GraphEditor binds the same keys. */
export const ALIGN_OPTIONS: { mode: AlignMode; label: string; key: string }[] = [
  { mode: "left", label: "Left", key: "A" },
  { mode: "center", label: "Horizontal center", key: "H" },
  { mode: "right", label: "Right", key: "D" },
  { mode: "top", label: "Top", key: "W" },
  { mode: "middle", label: "Vertical middle", key: "V" },
  { mode: "bottom", label: "Bottom", key: "S" },
];

export const DISTRIBUTE_OPTIONS: { axis: DistributeAxis; label: string; key: string }[] = [
  { axis: "horizontal", label: "Horizontally", key: "H" },
  { axis: "vertical", label: "Vertically", key: "V" },
];

export function arrangeActions(handlers: ArrangeHandlers): NodeContextMenuAction[] {
  return [
    {
      label: "Align",
      separatorBefore: true,
      disabled: handlers.count < 2,
      onClick: () => undefined,
      submenu: ALIGN_OPTIONS.map((option) => ({
        label: option.label,
        shortcut: `⌥${option.key}`,
        onClick: () => handlers.align(option.mode),
      })),
    },
    {
      label: "Distribute",
      title: handlers.count < 3 ? "Select three or more nodes" : undefined,
      disabled: handlers.count < 3,
      onClick: () => undefined,
      submenu: DISTRIBUTE_OPTIONS.map((option) => ({
        label: option.label,
        shortcut: `⌥⇧${option.key}`,
        onClick: () => handlers.distribute(option.axis),
      })),
    },
  ];
}

/** Pattern, weight and color as checkable items, plus a reset (§7). */
export function edgeStyleItems(style: EdgeStyle, setStyle: (style: EdgeStyle) => void): NodeContextMenuAction[] {
  return [
    ...EDGE_PATTERNS.map((option, index) => ({
      label: option.label,
      checked: style.pattern === option.value,
      groupLabel: index === 0 ? "Pattern" : undefined,
      onClick: () => setStyle({ ...style, pattern: option.value }),
    })),
    ...EDGE_WEIGHTS.map((option, index) => ({
      label: option.label,
      checked: style.weight === option.value,
      separatorBefore: index === 0,
      groupLabel: index === 0 ? "Weight" : undefined,
      onClick: () => setStyle({ ...style, weight: option.value }),
    })),
    ...EDGE_COLORS.map((option, index) => ({
      label: option.label,
      checked: style.color === option.value,
      separatorBefore: index === 0,
      groupLabel: index === 0 ? "Color" : undefined,
      icon: <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: option.stroke }} />,
      onClick: () => setStyle({ ...style, color: option.value }),
    })),
    {
      label: "Reset style",
      separatorBefore: true,
      disabled: Object.keys(style).length === 0,
      onClick: () => setStyle({}),
    },
  ];
}
