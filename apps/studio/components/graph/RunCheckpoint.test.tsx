import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunCheckpoint } from "./RunCheckpoint";
import { GenuiSurface } from "./ui/GenuiSurface";

afterEach(cleanup);

const SURFACE = JSON.stringify({
  root: {
    type: "Stack",
    children: [
      { type: "FormField", id: "amount", props: { label: "Amount", inputType: "number" } },
      { type: "FormField", id: "note", props: { label: "Note" } },
      { type: "Button", id: "b1", props: { label: "Escalate", actionId: "escalate" } },
      { type: "Button", id: "b2", props: { label: "Decline", actionId: "reject" } },
    ],
  },
});

const checkpoint = { nodeId: "gate_1", label: "Budget check", content: "Approve this spend?", surfaceJson: SURFACE };

describe("RunCheckpoint", () => {
  it("approves with the form values and reason", async () => {
    const onResume = vi.fn(async () => {});
    render(<RunCheckpoint checkpoint={checkpoint} onResume={onResume} />);
    expect(screen.getByRole("region", { name: "Approval needed at Budget check" })).toBeTruthy();
    expect(screen.getByText("Approve this spend?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "ok" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  within budget " } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(onResume).toHaveBeenCalledWith({ approve: true, reason: "within budget", values: { amount: 42, note: "ok" } }));
  });

  it("rejects without sending values", async () => {
    const onResume = vi.fn(async () => {});
    render(<RunCheckpoint checkpoint={checkpoint} onResume={onResume} />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(onResume).toHaveBeenCalledWith({ approve: false, reason: undefined, values: undefined }));
  });

  it("surface buttons dispatch: reject rejects, other actions approve and are recorded", async () => {
    const onResume = vi.fn(async () => {});
    render(<RunCheckpoint checkpoint={checkpoint} onResume={onResume} />);
    fireEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await waitFor(() => expect(onResume).toHaveBeenLastCalledWith({ approve: true, reason: undefined, values: { action: "escalate" } }));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(onResume).toHaveBeenLastCalledWith({ approve: false, reason: undefined, values: undefined }));
  });

  it("shows why a resume failed and lets the approver retry", async () => {
    const onResume = vi.fn(async () => {
      throw new Error("run has no pending human_gate checkpoint to resume");
    });
    render(<RunCheckpoint checkpoint={{ ...checkpoint, surfaceJson: "" }} onResume={onResume} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect((await screen.findByRole("alert")).textContent).toContain("no pending human_gate checkpoint");
    expect((screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("GenuiSurface", () => {
  it("is a read-only preview without handlers", () => {
    render(<GenuiSurface surface={JSON.parse(SURFACE)} />);
    expect((screen.getByLabelText("Amount") as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByRole("button", { name: "Escalate" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
