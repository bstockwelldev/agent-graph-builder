import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyGraphCoach } from "./EmptyGraphCoach";

afterEach(() => {
  cleanup();
});

describe("EmptyGraphCoach", () => {
  it("renders the current step and dismisses with Got it or Escape", () => {
    const onDismiss = vi.fn();
    render(
      <EmptyGraphCoach
        visible
        step={{
          title: "Build this graph",
          stepLabel: "Step 1 of 4",
          lines: ["Next: add a Prompt between Input and Output, then connect it."],
        }}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole("region", { name: "Authoring guide" })).toBeTruthy();
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    expect(screen.getByText(/Step 1 of 4\. Next: add a Prompt/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
