import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";

// CodeMirror needs a real layout engine; a textarea stands in for it here
// (e2e/specs/code-mode.spec.ts drives the real editor).
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockEditor({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
      return <textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />;
    },
}));

import { GraphCodeView } from "./GraphCodeView";

const graph: GraphDefinition = {
  id: "g1",
  name: "Demo",
  entry_node_id: "in",
  nodes: [{ id: "in", type: "input", label: "In", config: {}, position: { x: 0, y: 0 } }],
  edges: [],
} as GraphDefinition;

function setup(overrides: Partial<Parameters<typeof GraphCodeView>[0]> = {}) {
  window.localStorage.setItem("agb.rawEditor.syntax", "json");
  const props = {
    graph,
    getSavedGraph: () => graph,
    diagnostics: [],
    saving: false,
    onApply: vi.fn(),
    onSave: vi.fn(async () => true),
    ...overrides,
  };
  render(<GraphCodeView {...props} />);
  return props;
}

afterEach(cleanup);

const editor = () => screen.getByRole("textbox", { name: "Graph code (JSON)" });

describe("GraphCodeView", () => {
  it("applies valid edits to the canvas", () => {
    const props = setup();
    fireEvent.change(editor(), { target: { value: JSON.stringify({ ...graph, name: "Renamed" }, null, 2) } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }));
  });

  it("lists problems with their lines and keeps the text when the check fails", () => {
    const props = setup();
    const broken = JSON.stringify(graph, null, 2).replace('"name": "Demo",', '"name": 5,');
    fireEvent.change(editor(), { target: { value: broken } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const problems = screen.getByRole("list", { name: "Problems" });
    expect(problems.textContent).toMatch(/name: Expected string/);
    expect(problems.textContent).toContain("Line 3");
    expect(props.onSave).not.toHaveBeenCalled();
    expect((editor() as HTMLTextAreaElement).value).toBe(broken);
  });

  it("reviews the change against the saved version before saving", async () => {
    const props = setup();
    fireEvent.change(editor(), { target: { value: JSON.stringify({ ...graph, name: "Renamed" }, null, 2) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const changes = screen.getByRole("region", { name: "Review changes" });
    expect(changes.textContent).toContain("1 added · 1 removed");
    expect(changes.textContent).toMatch(/removed:\s+"name": "Demo",/);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" })));
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });

  it("says when there is nothing to save, and exposes save for ⌘S outside the editor", () => {
    const saveRef = { current: null as (() => void) | null };
    const props = setup({ saveRef });
    act(() => saveRef.current?.());
    expect(screen.getByRole("status").textContent).toContain("No changes to save.");
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
