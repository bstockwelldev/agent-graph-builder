import { describe, expect, it, vi } from "vitest";

import { NODE_TYPES } from "./NodePalette";
import {
  NODE_TYPE_GROUPS,
  edgeMenuActions,
  nodeMenuActions,
  paneMenuActions,
  selectionMenuActions,
} from "./canvasMenuActions";

// canvas-workbench-ergonomics-plan.md §3: one builder per right-click target.
describe("canvas menu actions", () => {
  it("groups every palette node type exactly once", () => {
    const grouped = NODE_TYPE_GROUPS.flatMap((group) => group.types);
    expect([...grouped].sort()).toEqual([...NODE_TYPES].sort());
  });

  it("empty canvas: Add node submenu, paste only with a clipboard, snap toggle", () => {
    const addNode = vi.fn();
    const setSnapToGrid = vi.fn();
    const handlers = {
      addNode,
      paste: null,
      selectAll: vi.fn(),
      autoArrange: vi.fn(),
      fitView: vi.fn(),
      snapToGrid: true,
      setSnapToGrid,
    };
    const actions = paneMenuActions(handlers);
    expect(actions.map((action) => action.label)).toEqual([
      "Add node",
      "Paste",
      "Select all",
      "Auto-arrange",
      "Fit view",
      "Snap to grid",
    ]);
    const add = actions[0].submenu!;
    expect(add.find((item) => item.groupLabel === "Model")?.label).toBe(
      "Prompt node",
    );
    add.find((item) => item.label === "LLM node")!.onClick();
    expect(addNode).toHaveBeenCalledWith("llm");
    expect(actions[1].disabled).toBe(true);
    expect(paneMenuActions({ ...handlers, paste: vi.fn() })[1].disabled).toBe(
      false,
    );
    expect(actions[5].checked).toBe(true);
    actions[5].onClick();
    expect(setSnapToGrid).toHaveBeenCalledWith(false);
  });

  it("node: dependency views, focus and delete", () => {
    const showDependencies = vi.fn();
    const actions = nodeMenuActions({
      edit: vi.fn(),
      runFromHere: vi.fn(),
      rename: vi.fn(),
      duplicate: vi.fn(),
      copy: vi.fn(),
      cut: vi.fn(),
      showDependencies,
      focusOnNode: vi.fn(),
      groupActions: [{ label: "Group node", onClick: vi.fn() }],
      remove: vi.fn(),
    });
    expect(actions.map((action) => action.label)).toEqual([
      "Edit configuration",
      "Run from here",
      "Rename",
      "Duplicate node",
      "Copy",
      "Cut",
      "Show upstream",
      "Show downstream",
      "Show all dependencies",
      "Focus on this node",
      "Group node",
      "Delete node",
    ]);
    actions.find((action) => action.label === "Show downstream")!.onClick();
    expect(showDependencies).toHaveBeenCalledWith("downstream");
    expect(actions.at(-1)!.tone).toBe("destructive");
  });

  it("edge: kind submenu checks the current kind; insert node splices a type", () => {
    const setKind = vi.fn();
    const insertNode = vi.fn();
    const actions = edgeMenuActions({
      kind: "conditional",
      edit: vi.fn(),
      setKind,
      insertNode,
      remove: vi.fn(),
    });
    const kinds = actions.find((action) => action.label === "Kind")!.submenu!;
    expect(kinds.map((item) => [item.label, item.checked])).toEqual([
      ["Always", false],
      ["Match text", true],
      ["Fallback", false],
    ]);
    kinds[2].onClick();
    expect(setKind).toHaveBeenCalledWith("default");
    actions
      .find((action) => action.label === "Insert node")!
      .submenu!.find((item) => item.label === "Transform node")!
      .onClick();
    expect(insertNode).toHaveBeenCalledWith("transform");
  });

  it("selection: counts what it deletes", () => {
    const actions = selectionMenuActions({
      count: 3,
      group: vi.fn(),
      extract: vi.fn(),
      copy: vi.fn(),
      cut: vi.fn(),
      remove: vi.fn(),
    });
    expect(actions.at(-1)!.label).toBe("Delete 3 nodes");
  });
});
