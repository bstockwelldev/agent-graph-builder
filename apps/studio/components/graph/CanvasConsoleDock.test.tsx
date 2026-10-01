import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetConsoleLogForTests, logConsoleEntry } from "@/lib/consoleLog";

import { CanvasConsoleDock, consoleCountsLabel } from "./CanvasConsoleDock";

beforeEach(() => __resetConsoleLogForTests());
afterEach(() => cleanup());

// canvas-workbench-ergonomics-plan.md §6: the console as a bottom dock.
describe("CanvasConsoleDock", () => {
  function seed() {
    logConsoleEntry({
      severity: "info",
      source: "Run",
      message: "Run started on stub",
      graphId: "g1",
    });
    logConsoleEntry({
      severity: "error",
      source: "Run",
      message: "node.failed",
      graphId: "g1",
      nodeId: "llm_answer",
    });
    logConsoleEntry({
      severity: "warning",
      source: "Validation",
      message: "Validated: 0 errors, 2 warnings",
      graphId: "g1",
    });
  }

  it("summarizes counts for the status bar", () => {
    expect(consoleCountsLabel({ info: 4, warning: 0, error: 0 })).toBe(
      "Console",
    );
    expect(consoleCountsLabel({ info: 0, warning: 5, error: 2 })).toBe(
      "2 errors · 5 warnings",
    );
    expect(consoleCountsLabel({ info: 0, warning: 1, error: 0 })).toBe(
      "1 warning",
    );
  });

  it("lists entries terminal-style and filters by level, source and text", () => {
    seed();
    render(
      <CanvasConsoleDock
        graphId="g1"
        onFocusNode={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const log = screen.getByRole("log", { name: "Console entries" });
    expect(log.querySelectorAll("[data-severity]")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Info 1" }));
    expect(log.querySelectorAll("[data-severity]")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Info 1" }));

    fireEvent.change(screen.getByRole("combobox", { name: "Source" }), {
      target: { value: "Validation" },
    });
    expect(log.textContent).toContain("2 warnings");
    expect(log.textContent).not.toContain("node.failed");
    fireEvent.change(screen.getByRole("combobox", { name: "Source" }), {
      target: { value: "" },
    });

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Filter console" }),
      { target: { value: "llm_answer" } },
    );
    expect(log.querySelectorAll("[data-severity]")).toHaveLength(1);
  });

  it("focuses a node from its entry, clears, and closes", () => {
    seed();
    const onFocusNode = vi.fn();
    const onClose = vi.fn();
    render(
      <CanvasConsoleDock
        graphId="g1"
        onFocusNode={onFocusNode}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "llm_answer" }));
    expect(onFocusNode).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "llm_answer", graphId: "g1" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear console" }));
    expect(
      screen.getByRole("log", { name: "Console entries" }).textContent,
    ).toContain("No entries yet");
    fireEvent.click(screen.getByRole("button", { name: "Close console" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("announces new errors, not every entry", () => {
    render(
      <CanvasConsoleDock
        graphId="g1"
        onFocusNode={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const status = screen.getByRole("status");
    act(() =>
      logConsoleEntry({
        severity: "info",
        source: "Run",
        message: "node.started",
      }),
    );
    expect(status.textContent).toBe("");
    act(() =>
      logConsoleEntry({
        severity: "error",
        source: "Save",
        message: "Save failed: 500",
      }),
    );
    expect(status.textContent).toBe("New error: Save failed: 500");
  });

  it("resizes from the keyboard and remembers the height", () => {
    render(
      <CanvasConsoleDock
        graphId="g1"
        onFocusNode={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const handle = screen.getByRole("separator", { name: "Resize console" });
    expect(handle.getAttribute("aria-valuenow")).toBe("220");
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(handle.getAttribute("aria-valuenow")).toBe("244");
    expect(window.localStorage.getItem("agb.console.height")).toBe("244");
  });
});
