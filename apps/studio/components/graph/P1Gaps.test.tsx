import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CounterfactualForm, CounterfactualResultView } from "./CounterfactualForm";
import { ReleasesPanel } from "./ReleasesPanel";
import { RoutingLabPanel } from "./RoutingLabPanel";

// STO-609: draft diff (ReleasesPanel), routing lab vs release, counterfactual replay.

const { clientMock } = vi.hoisted(() => ({
  clientMock: {
    listReleases: vi.fn(),
    getRelease: vi.fn(),
    compareDraftToRelease: vi.fn(),
    compareReleases: vi.fn(),
    compareRoutingToRelease: vi.fn(),
    compareRoutingDatasets: vi.fn(),
    runRoutingDataset: vi.fn(),
    datasets: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/api-client", () => ({ client: clientMock }));

const graph = {
  id: "g1",
  name: "Demo",
  entry_node_id: "llm_classify",
  nodes: [
    { id: "llm_classify", type: "llm", position: { x: 0, y: 0 }, config: { model: "qwen" } },
    { id: "router_1", type: "router", position: { x: 0, y: 0 }, config: {} },
    { id: "tool_lookup", type: "tool", position: { x: 0, y: 0 }, config: {} },
    { id: "prompt_answer", type: "prompt", position: { x: 0, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "llm_classify", target: "router_1" },
    { id: "e2", source: "router_1", target: "tool_lookup" },
    { id: "e3", source: "router_1", target: "prompt_answer" },
  ],
} as never;
const release = { release_id: "rel_abc", semantic_fingerprint: "f".repeat(64), document_fingerprint: "d", created_at: "2026-09-23T00:00:00Z" };

beforeEach(() => {
  Object.values(clientMock).forEach((fn) => (typeof fn === "function" ? fn.mockReset() : undefined));
  clientMock.listReleases.mockResolvedValue([release]);
  clientMock.datasets.list.mockResolvedValue([]);
  clientMock.getRelease.mockResolvedValue({
    id: "rel_abc",
    graph_id: "g1",
    graph,
    resource_snapshots: {},
    semantic_fingerprint: "f",
    document_fingerprint: "d",
    created_at: "2026-09-23T00:00:00Z",
    diagnostics: [],
  });
  try {
    window.localStorage.clear();
  } catch {
    // not persisted
  }
});
afterEach(cleanup);

describe("ReleasesPanel · Diff vs draft", () => {
  it("diffs the live canvas against a release", async () => {
    clientMock.compareDraftToRelease.mockResolvedValue({
      from_release_id: "rel_abc",
      to_release_id: null,
      to_label: "Draft",
      from_semantic_fingerprint: "a",
      to_semantic_fingerprint: "b",
      identical: false,
      node_changes: [{ id: "llm_classify", change: "modified", fields: { model: { from: "qwen", to: "gpt" } } }],
      edge_changes: [],
      resource_changes: [],
    });
    const getDraftGraph = vi.fn(() => graph);
    render(<ReleasesPanel graphId="g1" diagnostics={[]} dirty getDraftGraph={getDraftGraph} />);
    fireEvent.click(await screen.findByRole("button", { expanded: false, name: /rel_abc/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Diff vs draft" }));
    const diff = await screen.findByLabelText("Draft vs release diff");
    expect(getDraftGraph).toHaveBeenCalled();
    expect(clientMock.compareDraftToRelease).toHaveBeenCalledWith("rel_abc", graph);
    expect(within(diff).getByText("Draft (unsaved)")).toBeTruthy();
    expect(within(diff).getByText("llm_classify")).toBeTruthy();
  });
});

describe("RoutingLabPanel · compare against a release", () => {
  it("defaults to the latest release and labels baseline/candidate", async () => {
    clientMock.compareRoutingToRelease.mockResolvedValue({
      baseline: { graph_id: "g1", dataset_size: 1, distributions: [], total_estimated_usd: 0, runs: [] },
      candidate: { graph_id: "g1", dataset_size: 1, distributions: [], total_estimated_usd: 0, runs: [] },
      distribution_deltas: [],
    });
    render(<RoutingLabPanel graphId="g1" />);
    await waitFor(() => expect(clientMock.listReleases).toHaveBeenCalledWith("g1"));
    const compare = await screen.findByRole("button", { name: "Compare" });
    await waitFor(() => expect((compare as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(compare);
    await waitFor(() => expect(clientMock.compareRoutingToRelease).toHaveBeenCalledWith("g1", "latest", expect.any(Array)));
    expect(await screen.findByText("Release (latest)")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
  });
});

describe("CounterfactualForm", () => {
  it("submits only the chosen changes", () => {
    const onSubmit = vi.fn();
    render(<CounterfactualForm graph={graph} busy={false} onSubmit={onSubmit} onCancel={() => undefined} />);
    const submit = screen.getByRole("button", { name: "Replay with changes" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole("combobox", { name: "Route at router_1" }));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Force → prompt_answer/ }));
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ forced_routes: { router_1: "prompt_answer" }, model_overrides: {}, live_affected: false });
  });

  it("renders the node-by-node comparison with modes", () => {
    const trace = (node_id: string, output: unknown) => ({ node_id, node_type: "llm", status: "succeeded", output, started_at: "t" });
    render(
      <CounterfactualResultView
        result={{
          run: { run_id: "run_2", graph_id: "g1", status: "succeeded", input: {}, started_at: "t" },
          traces: [trace("router_1", "b"), trace("prompt_answer", "p")],
          original_traces: [trace("router_1", "a"), trace("tool_lookup", "t")],
          original_run_id: "run_1",
          counterfactual: true,
          changed_nodes: ["router_1", "prompt_answer", "tool_lookup"],
          node_modes: { router_1: "forced", prompt_answer: "recomputed" },
        } as never}
      />,
    );
    const rows = screen.getAllByTestId("counterfactual-node");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Forced route")).toBeTruthy();
    expect(within(rows[1]).getByText("Newly reached")).toBeTruthy();
    expect(within(rows[2]).getByText("Not reached")).toBeTruthy();
    expect(screen.getByText(/3 nodes changed/)).toBeTruthy();
  });
});
