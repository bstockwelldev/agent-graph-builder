import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({
  client: {
    getGraphAnalytics: vi.fn(async () => ({
      graph_id: "g",
      run_window: 4,
      totals: { invocations: 4, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_usd: 0.25, avg_duration_ms: 0 },
      succeeded_runs: 3,
      failed_runs: 1,
      success_rate: 0.75,
      p95_duration_ms: 1500,
      nodes: [
        {
          node_id: "slow_llm",
          node_type: "llm",
          executions: 4,
          succeeded: 2,
          failed: 2,
          success_rate: 0.5,
          avg_duration_ms: 1000,
          p95_duration_ms: 1400,
          last_run_id: "r4",
          last_run_at: null,
          last_error: "timeout",
        },
      ],
    })),
  },
}));

import { GraphAnalyticsView } from "./AnalyticsPanel";

afterEach(() => cleanup());

const context = {
  graphId: "g",
  graphName: "Support",
  getGraph: () => ({ id: "g", name: "Support", entry_node_id: "", nodes: [], edges: [] }),
  selectedNodeId: null,
  selectedEdgeId: null,
  runId: null,
};

// studio-graph-workbench-redesign-plan.md, Wave 2: graph-scoped analytics
// whose rows navigate back into the canvas.
describe("GraphAnalyticsView", () => {
  it("shows graph-level stats and per-node rows", async () => {
    render(<GraphAnalyticsView context={context} />);
    expect(await screen.findByText("75%")).toBeTruthy();
    expect(screen.getByText("1.50 s")).toBeTruthy();
    expect(screen.getByText("50%").className).toContain("text-destructive");
  });

  it("focuses the node (History tab) and inspects its last run", async () => {
    const focusNode = vi.fn();
    const inspectRun = vi.fn();
    render(<GraphAnalyticsView context={{ ...context, focusNode, inspectRun }} />);
    fireEvent.click(await screen.findByRole("button", { name: "slow_llm" }));
    expect(focusNode).toHaveBeenCalledWith("slow_llm", "history");
    fireEvent.click(screen.getByRole("button", { name: "run" }));
    expect(inspectRun).toHaveBeenCalledWith("r4");
  });
});
