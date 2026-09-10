import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CollapsibleSection } from "./CollapsibleSection";
import { shell } from "../../theme";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("CollapsibleSection", () => {
  it("uses a 44px header toggle", () => {
    render(
      <CollapsibleSection sectionId="test-section" title="Diagnostics">
        Body
      </CollapsibleSection>,
    );

    const toggle = screen.getByRole("button", { name: "Diagnostics" });
    expect(toggle.style.minHeight).toBe(`${shell.touchTarget.min}px`);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders headerActions outside the toggle button", () => {
    render(
      <CollapsibleSection
        sectionId="test-actions"
        title="Diagnostics"
        headerActions={<button type="button">Retry</button>}
      >
        Body
      </CollapsibleSection>,
    );

    const toggle = screen.getByRole("button", { name: "Diagnostics" });
    expect(toggle.querySelector("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).not.toBe(toggle);
  });

  it("supports controlled exclusive open", () => {
    const { rerender } = render(
      <CollapsibleSection sectionId="observe-status" title="Run status" open onOpenChange={() => undefined}>
        Status body
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: "Run status" }).getAttribute("aria-expanded")).toBe("true");

    rerender(
      <CollapsibleSection sectionId="observe-status" title="Run status" open={false} onOpenChange={() => undefined}>
        Status body
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: "Run status" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles with a click (Enter/Space activate the native button)", () => {
    render(
      <CollapsibleSection sectionId="test-toggle" title="Diagnostics" defaultOpen>
        Body
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button", { name: "Diagnostics" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
