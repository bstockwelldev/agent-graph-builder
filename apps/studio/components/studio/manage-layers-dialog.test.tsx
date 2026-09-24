import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ManageLayersDialog } from "./manage-layers-dialog";

// Wave 7d (STO-622): Manage layers.

afterEach(cleanup);

describe("ManageLayersDialog", () => {
  it("seeds defaults, renames, adds, deletes and applies with auto-assign", () => {
    const onApply = vi.fn();
    render(<ManageLayersDialog open onOpenChange={() => undefined} layers={[]} onApply={onApply} />);
    expect(screen.getByText("No layers yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use default layers" }));
    fireEvent.change(screen.getByLabelText("Layer 2 name"), { target: { value: "Thinking" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete Egress" }));
    fireEvent.click(screen.getByRole("button", { name: /Add layer/ }));
    fireEvent.click(screen.getByLabelText("Assign unassigned nodes"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const edit = onApply.mock.calls[0][0];
    expect(edit.autoAssign).toBe("unassigned");
    expect(edit.layers.map((l: { label: string }) => l.label)).toEqual(["Ingress", "Thinking", "Tools", "Layer 4"]);
  });
});
