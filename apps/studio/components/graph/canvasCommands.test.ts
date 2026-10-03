import { describe, expect, it, vi } from "vitest";

import { buildCanvasCommands, type CanvasCommandHandlers } from "./canvasCommands";

function handlers(overrides: Partial<CanvasCommandHandlers> = {}): CanvasCommandHandlers {
  return {
    selectedNodeIds: [],
    align: vi.fn(),
    distribute: vi.fn(),
    selectAll: vi.fn(),
    autoArrange: vi.fn(),
    fitView: vi.fn(),
    snapToGrid: true,
    setSnapToGrid: vi.fn(),
    focusMode: false,
    canFocus: false,
    toggleFocusMode: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    editorMode: "canvas",
    setEditorMode: vi.fn(),
    view: "canvas",
    setView: vi.fn(),
    save: vi.fn(),
    dirty: false,
    validate: vi.fn(),
    openRun: vi.fn(),
    find: vi.fn(),
    exportJson: vi.fn(),
    ...overrides,
  };
}

const byId = (commands: ReturnType<typeof buildCanvasCommands>, id: string) => commands.find((command) => command.id === id)!;

// The ⌘K palette's canvas actions.
describe("canvas commands", () => {
  it("align and distribute act on the selection, and say why they can't yet", () => {
    expect(byId(buildCanvasCommands(handlers({ selectedNodeIds: ["a"] })), "align-left").disabledReason).toBe("Select two or more nodes");
    const two = handlers({ selectedNodeIds: ["a", "b"] });
    const commands = buildCanvasCommands(two);
    expect(byId(commands, "align-left")).toMatchObject({ label: "Align left", shortcut: "⌥A", disabledReason: undefined });
    expect(byId(commands, "distribute-vertical").disabledReason).toBe("Select three or more nodes");
    byId(commands, "align-top").run();
    expect(two.align).toHaveBeenCalledWith(["a", "b"], "top");
    const three = handlers({ selectedNodeIds: ["a", "b", "c"] });
    byId(buildCanvasCommands(three), "distribute-horizontal").run();
    expect(three.distribute).toHaveBeenCalledWith(["a", "b", "c"], "horizontal");
  });

  it("toggles reflect the current state", () => {
    const h = handlers({ snapToGrid: true, editorMode: "code", view: "layers", dirty: true });
    const commands = buildCanvasCommands(h);
    expect(byId(commands, "snap").label).toBe("Turn snap to grid off");
    byId(commands, "snap").run();
    expect(h.setSnapToGrid).toHaveBeenCalledWith(false);
    expect(byId(commands, "mode-code").disabledReason).toBe("Already open");
    byId(commands, "mode-split").run();
    expect(h.setEditorMode).toHaveBeenCalledWith("split");
    expect(byId(commands, "view-layers").label).toBe("Leave layers view");
    expect(byId(commands, "save").disabledReason).toBeUndefined();
    expect(byId(buildCanvasCommands(handlers()), "save").disabledReason).toBe("No unsaved changes");
    expect(byId(buildCanvasCommands(handlers()), "focus-mode").disabledReason).toBe("Select a node first");
  });

  it("offers sticky notes only when the editor supports them", () => {
    expect(buildCanvasCommands(handlers()).some((command) => command.id === "add-note")).toBe(false);
    expect(byId(buildCanvasCommands(handlers({ addNote: vi.fn() })), "add-note").label).toBe("Add sticky note");
    const setVisible = vi.fn();
    const withNotes = buildCanvasCommands(handlers({ notes: { count: 2, visible: true, setVisible, openPanel: vi.fn() } }));
    expect(byId(withNotes, "notes-visible").label).toBe("Hide notes on canvas");
    byId(withNotes, "notes-visible").run();
    expect(setVisible).toHaveBeenCalledWith(false);
    expect(byId(buildCanvasCommands(handlers({ notes: { count: 0, visible: true, setVisible, openPanel: vi.fn() } })), "notes-visible").disabledReason).toBe("No notes yet");
  });
});
