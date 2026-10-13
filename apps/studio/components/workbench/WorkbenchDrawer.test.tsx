import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchProvider, useWorkbench } from "./WorkbenchProvider";
import { WorkbenchDrawer } from "./WorkbenchDrawer";
import type { WorkbenchPanelId } from "./panels";

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

// Desktop width: below it, panels render as ShellDrawer instead.
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });

let pathname = "/graphs/a";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

/** Moves the "router": the URL first, then the pathname React sees, as Next does. */
function navigate(to: string, rerender: () => void) {
  window.history.pushState({}, "", to);
  pathname = to;
  rerender();
}

let workbench: ReturnType<typeof useWorkbench>;
function Probe() {
  workbench = useWorkbench();
  return <output aria-label="active panel">{workbench.activePanel ?? "none"}</output>;
}

/** A page that opens chat from its mount effect, like a `?panel=chat` deep link. */
function DeepLinkPage() {
  const { open } = useWorkbench();
  useEffect(() => open("chat"), [open]);
  return null;
}

function Harness() {
  return (
    <WorkbenchProvider>
      <Probe />
      {pathname === "/graphs/deep-link" && <DeepLinkPage />}
      <WorkbenchDrawer panelId="chat" side="right">
        <p>chat body</p>
      </WorkbenchDrawer>
    </WorkbenchProvider>
  );
}

function setup(start = "/graphs/a") {
  window.history.pushState({}, "", start);
  pathname = start;
  const view = render(<Harness />);
  return { rerender: () => view.rerender(<Harness />) };
}

const active = () => screen.getByRole("status", { name: "active panel" }).textContent;
const openPanel = (panel: WorkbenchPanelId) => act(() => workbench.open(panel));

afterEach(() => cleanup());

describe("WorkbenchDrawer (floating)", () => {
  it("has a close button in its title bar", () => {
    setup();
    openPanel("chat");
    expect(screen.getByText("chat body")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Chat" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close Chat" }));
    expect(active()).toBe("none");
  });

  // canvas-styling-plan.md, PR 2: styled from the canvas tokens and the graph kit, so no shadcn primitive
  // (every one carries a data-slot) may appear.
  it("draws its title bar and help button from the canvas tokens, not shadcn", () => {
    setup();
    openPanel("chat");
    expect(screen.getByRole("heading", { name: "Chat" }).closest("[data-workbench-panel]")!.querySelector("[data-slot]")).toBeNull();
  });
});

describe("WorkbenchProvider route changes", () => {
  it("closes an app-wide panel when the user navigates away from where it was opened", () => {
    const { rerender } = setup("/graphs/a");
    openPanel("chat");
    expect(active()).toBe("chat");
    navigate("/graphs", rerender);
    expect(active()).toBe("none");
  });

  it("keeps a panel the new page opened as part of the navigation", () => {
    const { rerender } = setup("/graphs");
    // The page's effect runs before the provider's, in the same commit.
    navigate("/graphs/deep-link", rerender);
    expect(active()).toBe("chat");
  });

  it("leaves graph-scoped panels to the graph editor", () => {
    const { rerender } = setup("/graphs/a");
    openPanel("run");
    navigate("/graphs/b", rerender);
    expect(active()).toBe("run");
  });
});
