import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetClientMock } from "@/lib/mockClient";

import { EvalsPanel } from "./EvalsPanel";

const { clientMock } = vi.hoisted(() => ({
  clientMock: {
    evals: { suites: { list: vi.fn(), create: vi.fn() }, run: vi.fn(), runs: vi.fn(), compare: vi.fn() },
    datasets: { list: vi.fn() },
    releases: { list: vi.fn() },
  },
}));

vi.mock("@/lib/api-client", () => ({ client: clientMock }));

const suite = { id: "s1", name: "Quality", graph_id: "g1", dataset_id: "d1", scorers: [{ kind: "contains" }], pass_threshold: 1 };
const evalRun = (id: string, score: number, passed: boolean) => ({
  id,
  suite_id: "s1",
  graph_id: "g1",
  provider: "stub",
  started_at: "t",
  completed_at: "t",
  score,
  pass_rate: passed ? 1 : 0,
  estimated_usd: 0,
  cases: [
    {
      fixture_index: 0,
      run_id: `run_${id}`,
      status: "succeeded",
      score,
      passed,
      scores: [{ scorer: "contains", score, passed, detail: passed ? "" : "missing: index" }],
    },
  ],
});

beforeEach(() => {
  resetClientMock(clientMock);
  clientMock.datasets.list.mockResolvedValue([{ id: "d1", name: "Questions", fixtures: [{}, {}] }]);
  clientMock.releases.list.mockResolvedValue([]);
  try {
    window.localStorage.clear();
  } catch {
    // localStorage unavailable
  }
});
afterEach(() => cleanup());

describe("EvalsPanel", () => {
  it("creates a first suite from a dataset", async () => {
    clientMock.evals.suites.list.mockResolvedValueOnce([]).mockResolvedValue([suite]);
    clientMock.evals.suites.create.mockResolvedValue(suite);
    clientMock.evals.runs.mockResolvedValue([]);
    render(<EvalsPanel graphId="g1" />);

    expect(await screen.findByText(/No eval suites for this graph/)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Dataset" }), { target: { value: "d1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create suite" }));
    await waitFor(() => expect(clientMock.evals.suites.create).toHaveBeenCalledWith(expect.objectContaining({ graph_id: "g1", dataset_id: "d1", name: "Questions eval" })));
    expect(await screen.findByRole("button", { name: "Run suite" })).toBeTruthy();
  });

  it("runs a suite on Stub, shows why cases failed, and compares with the run before", async () => {
    clientMock.evals.suites.list.mockResolvedValue([suite]);
    clientMock.evals.runs.mockResolvedValue([evalRun("evr_old", 0, false)]);
    clientMock.evals.run.mockResolvedValue(evalRun("evr_new", 1, true));
    clientMock.evals.compare.mockResolvedValue({
      baseline: evalRun("evr_old", 0, false),
      candidate: evalRun("evr_new", 1, true),
      score_delta: 1,
      pass_rate_delta: 1,
      cases: [{ fixture_index: 0, baseline_score: 0, candidate_score: 1, delta: 1 }],
    });
    const onOpenRun = vi.fn();
    render(<EvalsPanel graphId="g1" onOpenRun={onOpenRun} />);

    // The latest stored run shows first.
    expect(await screen.findByText("missing: index", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run suite" }));
    await waitFor(() => expect(clientMock.evals.run).toHaveBeenCalledWith("s1", { target: "draft", provider: "stub", model: undefined, apiKey: undefined }));
    expect((await screen.findByRole("status", { name: "Eval result" })).textContent).toContain("100%");

    fireEvent.click(screen.getByRole("button", { name: "Open the run for case 1" }));
    expect(onOpenRun).toHaveBeenCalledWith("run_evr_new");

    fireEvent.click(screen.getByRole("button", { name: "Compare evr_new with the run before" }));
    const comparison = await screen.findByRole("region", { name: "Eval comparison" });
    expect(comparison.textContent).toContain("Score +100 pts");
    expect(clientMock.evals.compare).toHaveBeenCalledWith("evr_old", "evr_new");
  });

  it("asks for a key and warns about cost on a live provider", async () => {
    clientMock.evals.suites.list.mockResolvedValue([suite]);
    clientMock.evals.runs.mockResolvedValue([]);
    clientMock.evals.run.mockRejectedValue(new Error("groq needs an API key"));
    render(<EvalsPanel graphId="g1" />);

    fireEvent.change(await screen.findByRole("combobox", { name: "Provider" }), { target: { value: "groq" } });
    expect(screen.getByRole("note").textContent).toContain("billed by the provider");
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: " sk-1 " } });
    fireEvent.click(screen.getByRole("button", { name: "Run suite" }));
    await waitFor(() => expect(clientMock.evals.run).toHaveBeenCalledWith("s1", expect.objectContaining({ provider: "groq", apiKey: "sk-1" })));
    expect((await screen.findByRole("alert")).textContent).toContain("needs an API key");
  });
});
