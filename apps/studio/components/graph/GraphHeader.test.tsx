import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "@bstockwelldev/agent-graph-sdk";

import { GraphHeader } from "./GraphHeader";

afterEach(() => cleanup());

function diagnostic(severity: "error" | "warning"): Diagnostic {
  return { severity, code: "X", message: `${severity} message`, blocking: severity === "error" };
}

function renderHeader(overrides: Partial<Parameters<typeof GraphHeader>[0]> = {}) {
  const props: Parameters<typeof GraphHeader>[0] = {
    compact: false,
    graphName: "Customer Support",
    onGraphNameChange: vi.fn(),
    onBack: vi.fn(),
    dirty: false,
    saving: false,
    onSave: vi.fn(),
    diagnostics: [],
    onValidate: vi.fn(),
    activePanel: null,
    onTogglePanel: vi.fn(),
    onOpenRunSection: vi.fn(),
    focusMode: false,
    onToggleFocusMode: vi.fn(),
    onOpenChat: vi.fn(),
    layout: {
      orientation: "auto",
      onOrientationChange: vi.fn(),
      onRelayout: vi.fn(),
      onFitView: vi.fn(),
      spacing: "standard",
      onSpacingChange: vi.fn(),
      showMinimap: true,
      onShowMinimapChange: vi.fn(),
    },
    onExport: vi.fn(),
    onImport: vi.fn(),
    onShowShortcuts: vi.fn(),
    ...overrides,
  };
  render(<GraphHeader {...props} />);
  return props;
}

// studio-graph-workbench-redesign-plan.md, Slice 2.
describe("GraphHeader", () => {
  it("gives every icon control an accessible name", () => {
    renderHeader();
    for (const name of ["All graphs", "Save", "Run", "Run options", "Add node", "Layout", "Focus mode", "Chat about this graph", "More actions"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("moves low-frequency actions into the overflow menu", () => {
    renderHeader();
    // Not permanently in the header any more...
    expect(screen.queryByRole("button", { name: "Releases" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export JSON" })).toBeNull();
    // ...but one click away.
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    for (const name of ["Releases", "Routing lab", "Knowledge", "Export JSON", "Import JSON…", "Shortcuts"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("shows an open panel as checked in the overflow menu, not as a label swap", () => {
    renderHeader({ activePanel: "releases" });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitemcheckbox", { name: /Releases/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("reflects diagnostics in the Validate chip and calls onValidate", () => {
    const props = renderHeader({ diagnostics: [diagnostic("error"), diagnostic("warning")] });
    const chip = screen.getByRole("button", { name: /Validate graph \(1 error, 1 warning\)/ });
    fireEvent.click(chip);
    expect(props.onValidate).toHaveBeenCalledOnce();
  });

  it("reports a clean graph as valid", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Validate graph (Ready)" }).textContent).toContain("Valid");
  });

  it("puts layout direction, spacing and minimap in one Layout menu", () => {
    const props = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Layout" }));
    expect(screen.getByRole("menuitemcheckbox", { name: /Auto/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Vertical/ }));
    expect(props.layout.onOrientationChange).toHaveBeenCalledWith("vertical");
    fireEvent.click(screen.getByRole("button", { name: "Layout" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Relaxed/ }));
    expect(props.layout.onSpacingChange).toHaveBeenCalledWith("relaxed");
  });

  it("disables Save until there are unsaved changes", () => {
    renderHeader();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    renderHeader({ dirty: true });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("Unsaved");
  });
});
