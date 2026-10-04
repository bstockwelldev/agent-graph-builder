import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GraphSwitcherCombobox } from "./GraphSwitcherCombobox";

afterEach(() => cleanup());

// cmdk measures its list with ResizeObserver and scrolls the active item
// into view — neither exists in jsdom.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const graphs = [
  { id: "g1", name: "Alpha" },
  { id: "g2", name: "Beta" },
];

function openSwitcher() {
  const onSelect = vi.fn();
  render(
    <div data-testid="clipping-ancestor" style={{ overflow: "hidden" }}>
      <GraphSwitcherCombobox graphs={graphs} activeGraphId="g1" onSelect={onSelect} />
    </div>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
  return { onSelect };
}

describe("GraphSwitcherCombobox", () => {
  it("portals the popover outside clipping ancestors so the list is never cut off", () => {
    // Regression test for STO-628: GraphHeader's identity group is
    // overflow: hidden, which clipped the absolutely-positioned popover and
    // hid the graph list below "Find a graph…". jsdom can't catch visual
    // clipping, so assert the portal structure instead.
    openSwitcher();
    const input = screen.getByPlaceholderText("Find a graph…");
    const ancestor = screen.getByTestId("clipping-ancestor");
    expect(ancestor.contains(input)).toBe(false);
    expect(document.body.contains(input)).toBe(true);
  });

  it("lists every graph with the active one checked", () => {
    openSwitcher();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("g2")).toBeTruthy();
  });

  it("selects a graph and closes", () => {
    const { onSelect } = openSwitcher();
    fireEvent.click(screen.getByRole("option", { name: /Beta/ }));
    expect(onSelect).toHaveBeenCalledWith("g2");
    expect(screen.queryByPlaceholderText("Find a graph…")).toBeNull();
  });

  it("shows the empty state when there are no graphs", () => {
    render(<GraphSwitcherCombobox graphs={[]} activeGraphId={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch graph" }));
    expect(screen.getByText("No graphs found.")).toBeTruthy();
  });
});
