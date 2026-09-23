import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformEvent, RunSummary } from "@bstockwelldev/agent-graph-sdk";

vi.mock("@/lib/api-client", () => ({ client: {}, streamRunEvents: vi.fn() }));

import { RunCard, RunConfirmCard, type RunCardDeps } from "./run-card";
import { ToolStep } from "./tool-step";

afterEach(() => cleanup());

const ref = { run_id: "run_1", graph_id: "g", graph_name: "Support flow", source: "draft" as const, release_id: null, input: { question: "TCP?" } };
const summary = (status: RunSummary["status"]): RunSummary => ({ run_id: "run_1", graph_id: "g", status, provider: "stub", result: status === "succeeded" ? "done" : null }) as RunSummary;
const event = (event_type: string, node_id: string, payload: Record<string, unknown> = {}): PlatformEvent =>
  ({ sequence: 1, event_type, occurred_at: "2026-09-23T00:00:00.000Z", run_id: "run_1", node_id, payload }) as PlatformEvent;

// studio-ux-gap-remediation-plan.md §5 (STO-601).
describe("ToolStep", () => {
  it("is one collapsed line until expanded, then shows input and output", () => {
    render(<ToolStep name="llm_1" meta="llm · 1.2s" status="succeeded" input={{ prompt: "hi" }} output="hello" />);
    const row = screen.getByRole("button", { name: /llm_1/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("json-input")).toBeNull();
    fireEvent.click(row);
    expect(screen.getByTestId("json-input").textContent).toContain('"prompt": "hi"');
    expect(screen.getByTestId("json-output").textContent).toBe("hello");
  });

  it("truncates very large payloads behind Show all, inside a height-capped scroller", () => {
    const big = { rows: Array.from({ length: 200 }, (_, i) => ({ id: i, text: "x".repeat(20) })) };
    render(<ToolStep name="tool_1" status="succeeded" output={big} defaultOpen />);
    const block = screen.getByTestId("json-output");
    expect(block.className).toContain("max-h-40");
    expect(block.textContent!.endsWith("…")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Show all/ }));
    expect(screen.getByTestId("json-output").textContent!.endsWith("…")).toBe(false);
  });
});

// studio-ux-gap-remediation-plan.md §4 (STO-600).
describe("RunCard", () => {
  it("streams node progress into collapsed step rows, then settles on stored traces", async () => {
    let emit: (event: PlatformEvent) => void = () => undefined;
    const deps: RunCardDeps = {
      getRun: vi.fn(async () => summary("running")),
      getRunNodeTraces: vi.fn(async () => []),
      streamRunEvents: vi.fn((_runId, onEvent) => {
        emit = onEvent;
        return () => undefined;
      }),
    };
    const onViewRun = vi.fn();
    render(<RunCard runRef={ref} deps={deps} onViewRun={onViewRun} onViewFlow={vi.fn()} />);
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("running"));
    act(() => {
      emit(event("node.started", "input_1"));
      emit(event("node.completed", "input_1", { input: {}, output: "TCP?" }));
      emit(event("node.started", "llm_1"));
    });
    const steps = screen.getByLabelText("Run steps");
    expect(within(steps).getAllByRole("button").map((b) => b.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    expect(screen.getByLabelText("1 of 2 nodes done")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View run" }));
    expect(onViewRun).toHaveBeenCalled();
  });

  it("shows a finished run's traces, result and version", async () => {
    const deps: RunCardDeps = {
      getRun: vi.fn(async () => summary("succeeded")),
      getRunNodeTraces: vi.fn(async () => [
        { node_id: "input_1", node_type: "input", status: "succeeded", input: {}, output: "TCP?", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:00:00Z" },
      ]) as never,
      streamRunEvents: vi.fn(() => () => undefined),
    };
    render(<RunCard runRef={{ ...ref, source: "release", release_id: "rel_9" }} deps={deps} />);
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("succeeded"));
    expect(await screen.findByRole("button", { name: /input_1/ })).toBeTruthy();
    expect(screen.getByText("Release rel_9")).toBeTruthy();
    expect(screen.getByTestId("json-result").textContent).toBe("done");
    expect(deps.streamRunEvents).not.toHaveBeenCalled();
  });
});

describe("RunConfirmCard", () => {
  it("does nothing until Run is clicked", () => {
    const onConfirm = vi.fn();
    render(<RunConfirmCard graphName="Support flow" version="Latest release" input={{ question: "x" }} reason="Needs confirm" onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByRole("alertdialog", { name: "Confirm run of Support flow" })).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
