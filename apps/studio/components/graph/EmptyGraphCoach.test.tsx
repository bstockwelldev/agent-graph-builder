import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyGraphCoach } from "./EmptyGraphCoach";
import { spacing } from "@/lib/graph-theme";
import type { CoachStep } from "@/lib/graphAuthoring";

afterEach(() => cleanup());

const step: CoachStep = {
  title: "Build this graph",
  stepLabel: "Step 1 of 4",
  lines: ["Next: add a Prompt between Input and Output, then connect it."],
};

// Bug fix regression: this panel used to render at a fixed `top` inside the
// same coordinate frame as GraphEditor's floating top HUD, so the two
// collided — the panel rendered behind/overlapping the HUD instead of below
// it. These assert the panel's `top` always clears whatever `hudBottom`
// GraphEditor's ResizeObserver measured, with a safe fallback before that
// measurement lands.
describe("EmptyGraphCoach", () => {
  it("renders nothing while not visible", () => {
    render(<EmptyGraphCoach visible={false} step={step} onDismiss={vi.fn()} hudBottom={100} />);
    expect(screen.queryByRole("region", { name: "Authoring guide" })).toBeNull();
  });

  it("positions itself with a gap below the measured HUD bottom", () => {
    render(<EmptyGraphCoach visible step={step} onDismiss={vi.fn()} hudBottom={140} />);
    const panel = screen.getByRole("region", { name: "Authoring guide" });
    expect(panel.style.top).toBe(`${140 + spacing[4]}px`);
  });

  it("tracks a taller (wrapped) HUD to stay clear of it", () => {
    render(<EmptyGraphCoach visible step={step} onDismiss={vi.fn()} hudBottom={220} />);
    const panel = screen.getByRole("region", { name: "Authoring guide" });
    expect(panel.style.top).toBe(`${220 + spacing[4]}px`);
  });

  it("falls back to a safe offset when hudBottom hasn't been measured yet", () => {
    render(<EmptyGraphCoach visible step={step} onDismiss={vi.fn()} />);
    const panel = screen.getByRole("region", { name: "Authoring guide" });
    // Must clear the shortest realistic single-row HUD, not sit at the old
    // fixed 12px offset that caused the original overlap.
    expect(Number.parseFloat(panel.style.top)).toBeGreaterThanOrEqual(64);
  });

  it("renders the step content and calls onDismiss from the button", () => {
    const onDismiss = vi.fn();
    render(<EmptyGraphCoach visible step={step} onDismiss={onDismiss} hudBottom={100} />);

    expect(screen.getByText("Build this graph")).toBeTruthy();
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", () => {
    const onDismiss = vi.fn();
    render(<EmptyGraphCoach visible step={step} onDismiss={onDismiss} hudBottom={100} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
