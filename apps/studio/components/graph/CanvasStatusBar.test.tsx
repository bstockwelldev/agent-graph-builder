import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { __resetConsoleLogForTests, logConsoleEntry } from "@/lib/consoleLog";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasStatusBar } from "./CanvasStatusBar";

afterEach(() => cleanup());

const structure = {
  nodes: 8,
  edges: 8,
  entrypoints: ["input: question"],
  terminals: ["output"],
};

function renderBar(
  overrides: Partial<Parameters<typeof CanvasStatusBar>[0]> = {},
) {
  const props: Parameters<typeof CanvasStatusBar>[0] = {
    structure,
    focusMode: false,
    focusHops: 1,
    onFocusHopsChange: vi.fn(),
    onExitFocus: vi.fn(),
    focusNodeIds: [],
    snapToGrid: true,
    onSnapToGridChange: vi.fn(),
    onFitView: vi.fn(),
    ...overrides,
  };
  render(
    <ReactFlowProvider>
      <CanvasStatusBar {...props} />
    </ReactFlowProvider>,
  );
  return props;
}

// canvas-workbench-ergonomics-plan.md §8: the canvas status bar.
describe("CanvasStatusBar", () => {
  it("shows the graph structure with entry and terminal nodes", () => {
    renderBar();
    expect(screen.getByText("8 nodes · 8 edges")).toBeTruthy();
    expect(
      screen.getByLabelText(/8 nodes · 8 edges/).getAttribute("aria-label"),
    ).toContain("Entry: input: question · Terminal: output");
  });

  it("toggles snapping and fits the view from the zoom readout", () => {
    const props = renderBar();
    const snap = screen.getByRole("button", { name: "Snap" });
    expect(snap.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(snap);
    expect(props.onSnapToGridChange).toHaveBeenCalledWith(false);
    fireEvent.click(
      screen.getByRole("button", { name: /^Zoom \d+%\. Fit view$/ }),
    );
    expect(props.onFitView).toHaveBeenCalled();
  });

  it("opens the edge-kind legend as a popover and closes it with Escape", () => {
    renderBar();
    expect(screen.queryByRole("note", { name: "Edge kinds" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edge kinds" }));
    expect(
      screen.getByRole("note", { name: "Edge kinds" }).textContent,
    ).toContain("Match text");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("note", { name: "Edge kinds" })).toBeNull();
  });

  it("shows focus-mode controls only while focus mode is on", () => {
    renderBar();
    expect(screen.queryByRole("group", { name: "Focus mode" })).toBeNull();
    cleanup();
    const props = renderBar({ focusMode: true, focusHops: 1 });
    expect(
      screen
        .getByRole("button", { name: "1 hop around the selection" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: "2 hops around the selection" }),
    );
    expect(props.onFocusHopsChange).toHaveBeenCalledWith(2);
    // Nothing selected, nothing to fit.
    expect(
      (
        screen.getByRole("button", {
          name: "Fit to focus",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Exit focus mode (Esc)" }),
    );
    expect(props.onExitFocus).toHaveBeenCalled();
  });

  it("shows console counts and toggles the console dock", () => {
    __resetConsoleLogForTests();
    const onToggleConsole = vi.fn();
    renderBar({ onToggleConsole, consoleOpen: false });
    const toggle = screen.getByRole("button", { name: "Console: no errors or warnings" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => logConsoleEntry({ severity: "error", source: "Run", message: "node.failed" }));
    fireEvent.click(screen.getByRole("button", { name: "Console: 1 error" }));
    expect(onToggleConsole).toHaveBeenCalled();
  });

  it("picks the grid size next to the Snap toggle", () => {
    const onGridSizeChange = vi.fn();
    renderBar({ gridSize: 24, onGridSizeChange });
    const select = screen.getByRole("combobox", { name: "Grid size" }) as HTMLSelectElement;
    expect(select.value).toBe("24");
    expect([...select.options].map((option) => option.textContent)).toEqual(["12px", "24px", "48px"]);
    fireEvent.change(select, { target: { value: "48" } });
    expect(onGridSizeChange).toHaveBeenCalledWith(48);
  });
});
