import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NodeContextMenu } from "./NodeContextMenu";

afterEach(() => cleanup());

// canvas-workbench-ergonomics-plan.md §3: the hover highlight never showed
// (an inline background beat the CSS rule), and hover and arrow keys could
// highlight two items at once.
describe("NodeContextMenu", () => {
  function renderMenu() {
    const onClose = vi.fn();
    render(
      <NodeContextMenu
        x={10}
        y={10}
        title="Add node"
        onClose={onClose}
        actions={[
          { label: "LLM node", onClick: vi.fn() },
          { label: "Tool node", onClick: vi.fn() },
          { label: "Disabled", onClick: vi.fn(), disabled: true },
        ]}
      />,
    );
    return { onClose };
  }

  it("keeps the item background out of the inline style, so the hover rule applies", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: "LLM node" }).style.background).toBe("");
  });

  it("moves focus to the hovered item, so pointer and keyboard share one highlight", () => {
    renderMenu();
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Tool node" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Tool node" }));
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "LLM node" }));
    // A disabled item doesn't take focus.
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Disabled" }));
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "LLM node" }));
  });
});

describe("NodeContextMenu keyboard and submenus", () => {
  function renderWithSubmenu() {
    const onClose = vi.fn();
    const pickLlm = vi.fn();
    render(
      <NodeContextMenu
        x={10}
        y={10}
        title="Canvas"
        onClose={onClose}
        actions={[
          {
            label: "Add node",
            onClick: vi.fn(),
            submenu: [
              { label: "Input node", onClick: vi.fn() },
              { label: "LLM node", onClick: pickLlm },
              { label: "Output node", onClick: vi.fn() },
            ],
          },
          { label: "Paste", onClick: vi.fn() },
          { label: "Select all", onClick: vi.fn() },
          { label: "Snap to grid", onClick: vi.fn() },
        ]}
      />,
    );
    return { onClose, pickLlm };
  }

  it("Home, End and typeahead move focus like a native menu", () => {
    renderWithSubmenu();
    fireEvent.keyDown(window, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Snap to grid" }));
    fireEvent.keyDown(window, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /Add node/ }));
    // "s" cycles through the items starting with S.
    fireEvent.keyDown(window, { key: "s" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Select all" }));
  });

  it("opens a submenu with ArrowRight, and Escape closes the submenu before the menu", async () => {
    const { onClose, pickLlm } = renderWithSubmenu();
    const parent = screen.getByRole("menuitem", { name: /Add node/ });
    parent.focus();
    expect(parent.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    const submenu = screen.getByRole("menu", { name: "Add node" });
    expect(submenu.textContent).toContain("LLM node");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Add node" })).toBeNull();
    expect(document.activeElement).toBe(parent);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();

    // Hover opens it too, and picking an item runs it and closes the menu.
    cleanup();
    const second = renderWithSubmenu();
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: /Add node/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "LLM node" }));
    expect(second.pickLlm).toHaveBeenCalled();
    expect(second.onClose).toHaveBeenCalled();
    expect(pickLlm).not.toHaveBeenCalled();
  });

  it("closes when the window loses focus or the pointer scrolls the canvas", () => {
    const { onClose } = renderWithSubmenu();
    fireEvent.blur(window);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.wheel(screen.getByRole("button", { name: "Close context menu" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
