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
