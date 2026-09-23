import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  client: {
    providerCredentials: vi.fn(async () => ({ label: "API key", env_var: "X", configured: false })),
    listProviderModels: vi.fn(async () => ({ models: [], message: "" })),
  },
}));

import { RunPanel, observeTabForSection } from "./RunPanel";

afterEach(() => cleanup());

function renderPanel(overrides: Partial<Parameters<typeof RunPanel>[0]> = {}) {
  const onRun = vi.fn();
  render(
    <RunPanel
      graphId="g"
      inputVariables={["topic", "audience"]}
      diagnostics={[]}
      onCompile={vi.fn()}
      onRun={onRun}
      onDiagnosticClick={vi.fn()}
      runSummary={null}
      runHistory={[]}
      onSelectRun={vi.fn()}
      events={[]}
      selectedTrace={null}
      {...overrides}
    />,
  );
  return { onRun };
}

// studio-graph-workbench-redesign-plan.md, Wave 2.5 (STO-606): "one field per input variable".
describe("RunPanel (Run console v2)", () => {
  it("renders one labeled field per input variable", () => {
    renderPanel();
    expect(screen.getByLabelText("topic")).toBeTruthy();
    expect(screen.getByLabelText("audience")).toBeTruthy();
    expect(screen.getByText("Inputs · 2")).toBeTruthy();
  });

  it("⌘↵ from any field runs with every variable's value", () => {
    const { onRun } = renderPanel();
    fireEvent.change(screen.getByLabelText("topic"), { target: { value: "TCP" } });
    fireEvent.change(screen.getByLabelText("audience"), { target: { value: "kids" } });
    fireEvent.keyDown(screen.getByLabelText("audience"), { key: "Enter", metaKey: true });
    expect(onRun).toHaveBeenCalledWith({ topic: "TCP", audience: "kids" }, "stub", undefined, undefined);
  });

  it("the primary Run button sends the default question for question-only graphs", () => {
    const { onRun } = renderPanel({ inputVariables: ["question"] });
    fireEvent.click(screen.getByRole("button", { name: /^Run/ }));
    expect(onRun).toHaveBeenCalledWith({ question: "How does a database index work?" }, "stub", undefined, undefined);
  });

  it("shows Observe as tabs with counts and maps legacy section ids", () => {
    renderPanel({
      diagnostics: [{ code: "X", message: "Broken", severity: "error", node_id: "n1" } as never],
    });
    expect(screen.getByRole("tablist", { name: "Observe" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Issues/ }));
    expect(screen.getByText(/Broken/)).toBeTruthy();
    expect(observeTabForSection("run-diagnostics")).toBe("issues");
    expect(observeTabForSection("observe-history")).toBe("history");
    expect(observeTabForSection("run-simulate")).toBeNull();
  });
});
