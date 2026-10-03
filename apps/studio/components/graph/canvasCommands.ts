import type { AlignMode, DistributeAxis } from "@/lib/canvasAlign";
import type { EditorMode } from "@/lib/graphUrlState";
import { GRAPH_VIEWS, type GraphView } from "@/lib/graphLayers";
import { ALIGN_OPTIONS, DISTRIBUTE_OPTIONS } from "./canvasMenuActions";

// Canvas actions in the command palette (⌘K): the graph editor publishes
// these through the workbench's graph context, built fresh when the
// palette opens, so they always reflect the current selection.

export type CanvasCommandGroup = "Arrange" | "Canvas" | "View" | "Graph";

export type CanvasCommand = {
  id: string;
  group: CanvasCommandGroup;
  label: string;
  shortcut?: string;
  /** Why it can't run now (e.g. "Select two or more nodes"); the palette shows it disabled. */
  disabledReason?: string;
  keywords?: string[];
  run: () => void;
};

export type CanvasCommandHandlers = {
  /** Nodes in the multi-selection (what Align/Distribute act on). */
  selectedNodeIds: string[];
  align: (nodeIds: string[], mode: AlignMode) => void;
  distribute: (nodeIds: string[], axis: DistributeAxis) => void;
  selectAll: () => void;
  autoArrange: () => void;
  fitView: () => void;
  snapToGrid: boolean;
  setSnapToGrid: (on: boolean) => void;
  /** A node is selected, so focus mode has something to center on. */
  focusMode: boolean;
  canFocus: boolean;
  toggleFocusMode: () => void;
  addNote?: () => void;
  /** Sticky notes: the panel listing them, and showing them on the canvas. */
  notes?: { count: number; visible: boolean; setVisible: (visible: boolean) => void; openPanel: () => void };
  undo: () => void;
  redo: () => void;
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  view: GraphView;
  setView: (view: GraphView) => void;
  save: () => void;
  dirty: boolean;
  validate: () => void;
  openRun: () => void;
  find: () => void;
  exportJson: () => void;
};

export function buildCanvasCommands(h: CanvasCommandHandlers): CanvasCommand[] {
  const count = h.selectedNodeIds.length;
  const commands: CanvasCommand[] = [
    ...ALIGN_OPTIONS.map((option) => ({
      id: `align-${option.mode}`,
      group: "Arrange" as const,
      label: `Align ${option.label.toLowerCase()}`,
      shortcut: `⌥${option.key}`,
      disabledReason: count < 2 ? "Select two or more nodes" : undefined,
      keywords: ["align", "arrange", "line up"],
      run: () => h.align(h.selectedNodeIds, option.mode),
    })),
    ...DISTRIBUTE_OPTIONS.map((option) => ({
      id: `distribute-${option.axis}`,
      group: "Arrange" as const,
      label: `Distribute ${option.label.toLowerCase()}`,
      shortcut: `⌥⇧${option.key}`,
      disabledReason: count < 3 ? "Select three or more nodes" : undefined,
      keywords: ["distribute", "space evenly", "arrange"],
      run: () => h.distribute(h.selectedNodeIds, option.axis),
    })),
    { id: "auto-arrange", group: "Arrange", label: "Auto-arrange", keywords: ["layout", "tidy"], run: h.autoArrange },
    { id: "select-all", group: "Canvas", label: "Select all nodes", shortcut: "⌘A", run: h.selectAll },
    { id: "fit-view", group: "Canvas", label: "Fit view", keywords: ["zoom"], run: h.fitView },
    {
      id: "snap",
      group: "Canvas",
      label: h.snapToGrid ? "Turn snap to grid off" : "Turn snap to grid on",
      keywords: ["grid", "snap"],
      run: () => h.setSnapToGrid(!h.snapToGrid),
    },
    {
      id: "focus-mode",
      group: "Canvas",
      label: h.focusMode ? "Exit focus mode" : "Focus mode",
      disabledReason: !h.focusMode && !h.canFocus ? "Select a node first" : undefined,
      keywords: ["dim", "neighborhood"],
      run: h.toggleFocusMode,
    },
    ...(h.addNote ? [{ id: "add-note", group: "Canvas" as const, label: "Add sticky note", keywords: ["note", "comment", "sticky"], run: h.addNote }] : []),
    ...(h.notes
      ? [
          { id: "notes-panel", group: "Canvas" as const, label: "Show all notes", keywords: ["notes", "comments", "sticky"], run: h.notes.openPanel },
          {
            id: "notes-visible",
            group: "Canvas" as const,
            label: h.notes.visible ? "Hide notes on canvas" : "Show notes on canvas",
            disabledReason: h.notes.count === 0 ? "No notes yet" : undefined,
            keywords: ["notes", "sticky"],
            run: () => h.notes!.setVisible(!h.notes!.visible),
          },
        ]
      : []),
    { id: "undo", group: "Canvas", label: "Undo", shortcut: "⌘Z", run: h.undo },
    { id: "redo", group: "Canvas", label: "Redo", shortcut: "⌘⇧Z", run: h.redo },
    ...(["canvas", "code", "split"] as const).map((mode) => ({
      id: `mode-${mode}`,
      group: "View" as const,
      label: `${mode === "canvas" ? "Canvas" : mode === "code" ? "Code" : "Split"} view`,
      disabledReason: h.editorMode === mode ? "Already open" : undefined,
      keywords: mode === "canvas" ? ["graph"] : ["json", "yaml", "code"],
      run: () => h.setEditorMode(mode),
    })),
    ...GRAPH_VIEWS.filter((option) => option.value !== "canvas").map((option) => ({
      id: `view-${option.value}`,
      group: "View" as const,
      label: h.view === option.value ? `Leave ${option.label.toLowerCase()} view` : `${option.label} view`,
      run: () => h.setView(h.view === option.value ? "canvas" : option.value),
    })),
    { id: "save", group: "Graph", label: "Save", shortcut: "⌘S", disabledReason: h.dirty ? undefined : "No unsaved changes", run: h.save },
    { id: "validate", group: "Graph", label: "Validate", keywords: ["check", "issues"], run: h.validate },
    { id: "run", group: "Graph", label: "Run…", keywords: ["execute"], run: h.openRun },
    { id: "find", group: "Graph", label: "Find on canvas", shortcut: "⌘F", run: h.find },
    { id: "export", group: "Graph", label: "Export JSON", keywords: ["download"], run: h.exportJson },
  ];
  return commands;
}
