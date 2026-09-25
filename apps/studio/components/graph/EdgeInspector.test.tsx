import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic, GraphEdge } from "@bstockwelldev/agent-graph-sdk";

vi.mock("@/lib/api-client", () => ({
  client: { transforms: { list: vi.fn(async () => [{ id: "fact_line", name: "Fact line", type: "format_message", template: "Fact: {value}" }]) } },
}));

import { EdgeInspector } from "./NodeInspector";

afterEach(() => cleanup());

const EDGE: GraphEdge = { id: "e1", source: "tool_lookup", target: "output_1", kind: "sequence", condition: null };

function renderEdge(edge: GraphEdge = EDGE, issues: Diagnostic[] = []) {
  const onChange = vi.fn();
  render(<EdgeInspector edge={edge} issues={issues} onChange={onChange} onDelete={vi.fn()} />);
  return onChange;
}

describe("EdgeInspector transform", () => {
  it("offers Add transform when the edge has none and nothing needs one", () => {
    const onChange = renderEdge();
    expect(screen.queryByRole("radiogroup", { name: "Transform type" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Add transform/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Format" }));
    expect(onChange).toHaveBeenCalledWith({ transform: { type: "format_message", template: "{value}" } });
  });

  it("opens the section for a kind mismatch and shows its issue there", () => {
    const issue: Diagnostic = {
      severity: "warning",
      code: "CONTRACT_KIND_INFERRED_MISMATCH",
      message: "'structured-json' -> 'message' requires an explicit transform",
      blocking: false,
      edge_id: "e1",
    };
    renderEdge(EDGE, [issue]);
    expect(screen.getByRole("radiogroup", { name: "Transform type" })).toBeTruthy();
    expect(screen.getByText(/requires an explicit transform/)).toBeTruthy();
  });

  it("edits the fields for the chosen type and can remove the transform", () => {
    const onChange = renderEdge({ ...EDGE, transform: { type: "select", pointer: "/a" } });
    fireEvent.change(screen.getByLabelText("Field path"), { target: { value: "/answer" } });
    expect(onChange).toHaveBeenLastCalledWith({ transform: { type: "select", pointer: "/answer" } });
    fireEvent.click(screen.getByRole("radio", { name: "None" }));
    expect(onChange).toHaveBeenLastCalledWith({ transform: null });
  });

  it("applies a transform from the Raw view", () => {
    const onChange = renderEdge();
    fireEvent.click(screen.getByRole("tab", { name: "Raw JSON" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: '{"kind": "sequence", "condition": null, "transform": {"type": "wrap", "field": "topic"}}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith({ kind: "sequence", condition: null, transform: { type: "wrap", field: "topic" } });
  });

  it("shows a library-bound transform by name, and switching to inline clears it", async () => {
    const onChange = renderEdge({ ...EDGE, transform: { transform_id: "fact_line" } });
    expect(screen.getByRole("radio", { name: /Library/ }).getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText(/Fact line/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Inline/ }));
    expect(onChange).toHaveBeenCalledWith({ transform: null });
  });
});
