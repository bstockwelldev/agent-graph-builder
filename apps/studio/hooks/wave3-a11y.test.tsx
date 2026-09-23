import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellDrawer } from "@/components/graph/ShellDrawer";
import { WorkbenchProvider, hasOverlayOwningEscape, useWorkbench } from "@/components/workbench/WorkbenchProvider";
import { usePresence } from "./usePresence";

// jsdom has no matchMedia (useShellLayout reads it).
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// studio-graph-workbench-redesign-plan.md, Wave 3 (STO-604): motion + accessibility.
describe("usePresence", () => {
  it("stays mounted through the exit animation, then unmounts", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ show }) => usePresence(show, 160), { initialProps: { show: true } });
    expect(result.current).toEqual({ mounted: true, closing: false });
    rerender({ show: false });
    expect(result.current).toEqual({ mounted: true, closing: true });
    act(() => vi.advanceTimersByTime(160));
    expect(result.current).toEqual({ mounted: false, closing: false });
  });

  it("unmounts at once under reduced motion", () => {
    const { result, rerender } = renderHook(({ show }) => usePresence(show, 160, true), { initialProps: { show: true } });
    rerender({ show: false });
    expect(result.current.mounted).toBe(false);
  });
});

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open run
      </button>
      <ShellDrawer open={open} onClose={() => setOpen(false)} side="right" title="Run" drawerId="d">
        <input aria-label="first field" />
        <button type="button">Last action</button>
      </ShellDrawer>
    </>
  );
}

describe("ShellDrawer focus management", () => {
  it("starts on the close button, traps Tab, closes on Escape and restores focus", () => {
    render(<DrawerHarness />);
    const opener = screen.getByRole("button", { name: "Open run" });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close Run" }));

    screen.getByRole("button", { name: "Last action" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close Run" }));
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last action" }));

    fireEvent.keyDown(screen.getByLabelText("first field"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

function PanelHarness({ withMenu = false }: { withMenu?: boolean }) {
  const workbench = useWorkbench();
  return (
    <>
      <button type="button" onClick={() => workbench.open("run")}>
        Open panel
      </button>
      <span data-testid="active">{workbench.activePanel ?? "none"}</span>
      {workbench.activePanel === "run" && (
        <div>
          <button type="button">Inside panel</button>
          {withMenu && <div role="menu">menu</div>}
        </div>
      )}
    </>
  );
}

describe("WorkbenchProvider Escape", () => {
  it("closes the active panel and returns focus to its opener", async () => {
    render(
      <WorkbenchProvider>
        <PanelHarness />
      </WorkbenchProvider>,
    );
    const opener = screen.getByRole("button", { name: "Open panel" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByTestId("active").textContent).toBe("run");
    screen.getByRole("button", { name: "Inside panel" }).focus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("active").textContent).toBe("none");
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(document.activeElement).toBe(opener);
  });

  it("leaves the panel open while a menu owns Escape", () => {
    render(
      <WorkbenchProvider>
        <PanelHarness withMenu />
      </WorkbenchProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open panel" }));
    expect(hasOverlayOwningEscape()).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("active").textContent).toBe("run");
  });
});
