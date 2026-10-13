import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/graphs/g" }));

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
vi.mock("@/lib/api-client", () => ({
  client: {
    analytics: {
      dashboard: vi.fn(async () => ({
        totals: { invocations: 7, input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_usd: 0.5, avg_duration_ms: 10 },
        daily: [],
        by_graph: [],
      })),
      graph: vi.fn(async () => ({
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
  },
}));

import { WorkbenchProvider, useWorkbench } from "../WorkbenchProvider";
import { AnalyticsPanel, GraphAnalyticsView } from "./AnalyticsPanel";

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

function OpenAnalytics({ scope }: { scope?: string }) {
  const workbench = useWorkbench();
  useEffect(() => {
    workbench.setGraphContext(context);
    workbench.open("analytics", scope ? { scope } : undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Canvas-first landing plan, Phase 2 (§4 item 5): ?panel=analytics&scope=workspace.
describe("AnalyticsPanel scope", () => {
  it("defaults to the open graph", async () => {
    render(
      <WorkbenchProvider>
        <OpenAnalytics />
        <AnalyticsPanel />
      </WorkbenchProvider>,
    );
    expect(await screen.findByText("75%")).toBeTruthy();
    expect(screen.getByRole("button", { name: "This graph" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens on the workspace when the panel context asks for it", async () => {
    render(
      <WorkbenchProvider>
        <OpenAnalytics scope="workspace" />
        <AnalyticsPanel />
      </WorkbenchProvider>,
    );
    expect(await screen.findByText("Invocations")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Workspace" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("75%")).toBeNull();
  });
});
