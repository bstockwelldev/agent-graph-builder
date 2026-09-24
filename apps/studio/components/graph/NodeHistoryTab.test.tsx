import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  client: {
    analytics: {
      graph: vi.fn(async () => ({
      graph_id: "g",
      run_window: 3,
      totals: { invocations: 3, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_usd: 0, avg_duration_ms: 0 },
      succeeded_runs: 1,
      failed_runs: 2,
      success_rate: 1 / 3,
      p95_duration_ms: 900,
      nodes: [
        {
          node_id: "llm_1",
          node_type: "llm",
          executions: 3,
          succeeded: 1,
          failed: 2,
          success_rate: 1 / 3,
          avg_duration_ms: 600,
          p95_duration_ms: 900,
          last_run_id: "r3",
          last_run_at: null,
          last_error: "boom",
        },
      ],
    })),
      nodeHistory: vi.fn(async () => [
      { run_id: "r3", run_status: "failed", status: "failed", started_at: null, duration_ms: 900, error: "boom" },
      { run_id: "r2", run_status: "succeeded", status: "succeeded", started_at: null, duration_ms: 300, error: null },
      ]),
    },
  },
}));

import { NodeHistoryTab } from "./NodeHistoryTab";

afterEach(() => cleanup());

// studio-graph-workbench-redesign-plan.md, Wave 2.
describe("NodeHistoryTab", () => {
  it("shows the node's metrics and recent executions", async () => {
    render(<NodeHistoryTab graphId="g" nodeId="llm_1" />);
    expect(await screen.findByText("33%")).toBeTruthy();
    expect(screen.getByText("600 ms")).toBeTruthy();
    // 900 ms appears as both the P95 metric and the failed execution's duration.
    expect(screen.getAllByText("900 ms")).toHaveLength(2);
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("inspects a run when an execution row is clicked", async () => {
    const onInspectRun = vi.fn();
    render(<NodeHistoryTab graphId="g" nodeId="llm_1" onInspectRun={onInspectRun} />);
    fireEvent.click(await screen.findByTitle("boom"));
    expect(onInspectRun).toHaveBeenCalledWith("r3");
  });
});
