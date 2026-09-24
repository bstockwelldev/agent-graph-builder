import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FindBar } from "./FindBar";
import { HealthPanel } from "./HealthPanel";
import { NodeImpactTab } from "./NodeImpactTab";
import { agentGraphWrapper } from "@/lib/agentGraphTestWrapper";

// Wave 7a (STO-610): find on canvas, health panel, node impact tab.

const { clientMock } = vi.hoisted(() => ({ clientMock: { graphs: { impact: vi.fn() } } }));
vi.mock("@/lib/api-client", () => ({ client: clientMock }));

const nodes = [
  { id: "input_1", data: { nodeType: "input", label: "input", config: {} } },
  { id: "llm_classify", data: { nodeType: "llm", label: "qwen", config: {} } },
  { id: "router_1", data: { nodeType: "router", label: "router", config: {} } },
  { id: "llm_answer", data: { nodeType: "llm", label: "qwen", config: {} } },
];

beforeEach(() => clientMock.graphs.impact.mockReset());
afterEach(cleanup);

describe("FindBar", () => {
  it("counts matches, walks them with Enter, reports matches and closes on Esc", () => {
    const onFocusNode = vi.fn();
    const onMatchesChange = vi.fn();
    const onClose = vi.fn();
    render(<FindBar nodes={nodes} onFocusNode={onFocusNode} onMatchesChange={onMatchesChange} onClose={onClose} />);
    const input = screen.getByRole("textbox", { name: "Find nodes" });
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "type:llm" } });
    expect(screen.getByRole("status").textContent).toBe("1 of 2");
    expect(onMatchesChange).toHaveBeenLastCalledWith(["llm_classify", "llm_answer"]);

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onFocusNode.mock.calls.map((c) => c[0])).toEqual(["llm_classify", "llm_answer"]);
    expect(screen.getByRole("status").textContent).toBe("2 of 2");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onFocusNode).toHaveBeenLastCalledWith("llm_classify");

    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByRole("status").textContent).toBe("No matches");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("HealthPanel", () => {
  it("shows score, band and focuses nodes from items", () => {
    const onFocusNode = vi.fn();
    render(
      <HealthPanel
        loading={false}
        error={null}
        onRefresh={() => undefined}
        onFocusNode={onFocusNode}
        health={{
          graph_id: "g",
          score: 72,
          band: "attention",
          computed_at: "t",
          factors: [
            { id: "warnings", label: "Warnings", deduction: 3, max: 15, items: [{ message: "graph-level warning" }] },
            { id: "unreachable", label: "Unreachable nodes", deduction: 25, max: 15, items: [{ node_id: "orphan", message: "orphan can't be reached" }] },
            { id: "untested", label: "Untested nodes", deduction: 0, max: 15, items: [], note: "No runs yet." },
          ],
        }}
      />,
    );
    expect(screen.getByLabelText("Health score 72 of 100")).toBeTruthy();
    expect(screen.getByText("Needs attention")).toBeTruthy();
    const factors = screen.getAllByRole("region");
    expect(factors[0].getAttribute("aria-label")).toBe("Unreachable nodes"); // biggest deduction first
    fireEvent.click(within(factors[0]).getByRole("button", { name: /orphan can't be reached/ }));
    expect(onFocusNode).toHaveBeenCalledWith("orphan");
    expect(screen.getByText("No runs yet.")).toBeTruthy();
  });
});

describe("NodeImpactTab", () => {
  it("loads impact for the draft, highlights downstream and navigates", async () => {
    clientMock.graphs.impact.mockResolvedValue({
      node_id: "llm_classify",
      downstream: ["router_1", "llm_answer"],
      outputs_reached: [],
      routers_downstream: ["router_1"],
      upstream_count: 1,
      bindings: [{ field: "systemPromptId", kind: "prompts", resource_id: "p_sys" }],
      runs: { executions: 3, last_run_id: "run_1", last_run_at: new Date().toISOString() },
      releases: [{ release_id: "rel_1", created_at: "t", changed_since: true }],
      datasets: [{ dataset_id: "ds_1", name: "Stubbed" }],
    });
    const draft = { id: "g1" } as never;
    const onHighlight = vi.fn();
    const onSelectNode = vi.fn();
    const onOpenResource = vi.fn();
    const { unmount } = render(
      <NodeImpactTab
        graphId="g1"
        nodeId="llm_classify"
        getDraftGraph={() => draft}
        onHighlight={onHighlight}
        onSelectNode={onSelectNode}
        onOpenResource={onOpenResource}
      />,
      { wrapper: agentGraphWrapper(clientMock) },
    );
    await screen.findByText(/Changing this node reaches 2 nodes · 0 outputs/);
    expect(clientMock.graphs.impact).toHaveBeenCalledWith("g1", { nodeId: "llm_classify", draft });
    expect(onHighlight).toHaveBeenCalledWith(["llm_classify", "router_1", "llm_answer"]);
    expect(screen.getByText("changed since")).toBeTruthy();
    expect(screen.getByText("Stubbed")).toBeTruthy();
    expect(screen.getByText(/Executed 3 times/)).toBeTruthy();

    fireEvent.click(within(screen.getByRole("region", { name: "Downstream (2)" })).getByRole("button", { name: "llm_answer" }));
    expect(onSelectNode).toHaveBeenCalledWith("llm_answer");
    fireEvent.click(screen.getByRole("button", { name: /p_sys/ }));
    expect(onOpenResource).toHaveBeenCalledWith("prompts", "p_sys");

    unmount();
    await waitFor(() => expect(onHighlight).toHaveBeenLastCalledWith(null));
  });
});
