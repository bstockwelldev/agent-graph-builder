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

  // Slice 5: richer components, bound to the paused run's data.
  it("binds $refs to the run, and collects Select and Checkbox answers", async () => {
    const surfaceJson = JSON.stringify({
      root: {
        type: "Stack",
        children: [
          { type: "Approval", props: { title: "Ship it?", summary: { $ref: "/nodes/llm/output" }, approveLabel: "Ship" } },
          { type: "Table", props: { rows: { $ref: "/nodes/tool/output" }, caption: "Orders" } },
          { type: "Text", props: { content: { $ref: "/nodes/later/output" } } },
          { type: "Select", id: "cohort", props: { label: "Cohort", options: ["10%", "50%"] } },
          { type: "Checkbox", id: "notify", props: { label: "Notify" } },
        ],
      },
    });
    const onResume = vi.fn(async () => {});
    const data = {
      input: {},
      nodes: {
        llm: { status: "succeeded", input: null, output: "Looks **good**" },
        tool: { status: "succeeded", input: null, output: [{ id: 1, total: 20 }] },
      },
    };
    render(<RunCheckpoint checkpoint={{ ...checkpoint, surfaceJson }} onResume={onResume} data={data} />);
    expect(screen.getByText("good").tagName).toBe("STRONG");
    expect(screen.getByRole("region", { name: "Orders" }).textContent).toContain("20");
    expect(screen.getByText("/nodes/later/output").parentElement?.textContent).toContain("not in this run yet");

    fireEvent.change(screen.getByLabelText("Cohort"), { target: { value: "50%" } });
    fireEvent.click(screen.getByLabelText("Notify"));
    fireEvent.click(screen.getByRole("button", { name: "Ship" }));
    await waitFor(() => expect(onResume).toHaveBeenCalledWith({ approve: true, reason: undefined, values: { cohort: "50%", notify: true } }));
  });

  it("still offers Approve and Reject when the surface is invalid", () => {
    render(<RunCheckpoint checkpoint={{ ...checkpoint, surfaceJson: '{"root":{"type":"Nope"}}' }} onResume={vi.fn(async () => {})} />);
    expect(screen.getByText(/surface can't render/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });
});

describe("GenuiSurface previews", () => {
  it("shows where a $ref points without run data, and draws charts with a table view", () => {
    const surface = {
      root: {
        type: "Stack" as const,
        children: [
          { type: "Chart" as const, props: { title: "Revenue", data: [{ w: "W1", r: 10 }, { w: "W2", r: 15 }], x: "w", y: "r" } },
          { type: "Diagram" as const, props: { source: "graph LR\nA[Start] --> B[End]" } },
          { type: "KeyValue" as const, props: { items: { q: { $ref: "/input/q" } } } },
        ],
      },
    };
    render(<GenuiSurface surface={surface} />);
    expect(screen.getByRole("img", { name: /Revenue: bar chart of r by w, 2 points/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Start to End/ })).toBeTruthy();
    expect(screen.getByText("/input/q").parentElement?.textContent).toContain("filled in from the run");
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("columnheader", { name: "r" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "15" })).toBeTruthy();
  });

  it("asks for the API key when the server needs it again, and resends it", async () => {
    const onResume = vi
      .fn()
      .mockRejectedValueOnce(new Error("This run uses groq, which needs an API key to continue. Enter the key and approve again."))
      .mockResolvedValueOnce(undefined);
    render(<RunCheckpoint checkpoint={{ ...checkpoint, surfaceJson: "" }} onResume={onResume} />);
    expect(screen.queryByLabelText("API key")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/needs an API key/));
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: " sk-test " } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(onResume).toHaveBeenLastCalledWith(expect.objectContaining({ approve: true, apiKey: "sk-test" })));
  });
});
