import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RunSummary } from "@bstockwelldev/agent-graph-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureDatasetDialog } from "./capture-dataset-dialog";

const { createFromRunsMock } = vi.hoisted(() => ({ createFromRunsMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ client: { createDatasetFromRuns: createFromRunsMock } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const run = (run_id: string, status: RunSummary["status"]) => ({ run_id, status, graph_id: "g1" }) as RunSummary;
const saved = {
  id: "ds_1",
  name: "Captured",
  description: null,
  graph_id: "g1",
  fixtures: [{ input: {}, node_outputs: {} }],
  source: "runs" as const,
  source_run_ids: ["r1"],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  createFromRunsMock.mockReset();
});
afterEach(() => cleanup());

function renderDialog(runs: RunSummary[]) {
  const onOpenChange = vi.fn();
  render(<CaptureDatasetDialog open onOpenChange={onOpenChange} graphId="g1" runs={runs} />);
  return { onOpenChange };
}

describe("CaptureDatasetDialog", () => {
  it("prefills a name and saves with the selected run ids, freezing outputs by default", async () => {
    createFromRunsMock.mockResolvedValue(saved);
    renderDialog([run("r1", "succeeded"), run("r2", "succeeded")]);

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toMatch(/^g1 · 2 runs · \d{4}-\d{2}-\d{2}$/);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  My set " } });
    fireEvent.click(screen.getByRole("button", { name: "Save dataset" }));

    await waitFor(() => expect(createFromRunsMock).toHaveBeenCalledTimes(1));
    expect(createFromRunsMock).toHaveBeenCalledWith({
      name: "My set",
      description: undefined,
      runIds: ["r1", "r2"],
      includeNodeOutputs: true,
    });
    expect((await screen.findByRole("status")).textContent).toContain("Saved Captured with 1 fixture");
  });

  it("blocks saving when freezing outputs of a run that did not succeed", () => {
    renderDialog([run("r1", "succeeded"), run("r2", "failed")]);

    expect(screen.getByRole("alert").textContent).toContain("1 selected run didn't succeed (failed)");
    expect((screen.getByRole("button", { name: "Save dataset" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows non-succeeded runs once freezing is turned off, sending inputs only", async () => {
    createFromRunsMock.mockResolvedValue(saved);
    renderDialog([run("r1", "failed")]);

    fireEvent.click(screen.getByLabelText(/Freeze recorded node outputs/));
    const save = screen.getByRole("button", { name: "Save dataset" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(createFromRunsMock).toHaveBeenCalled());
    expect(createFromRunsMock.mock.calls[0]?.[0]).toMatchObject({ includeNodeOutputs: false });
  });

  it("disables saving without a name", () => {
    renderDialog([run("r1", "succeeded")]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Save dataset" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the backend's error detail when saving fails", async () => {
    createFromRunsMock.mockRejectedValue(
      new Error('POST /api/datasets/from-runs failed (422): {"detail":"Runs span multiple graphs"}'),
    );
    renderDialog([run("r1", "succeeded")]);
    fireEvent.click(screen.getByRole("button", { name: "Save dataset" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Runs span multiple graphs");
  });

  it("links to the graph after a successful save", async () => {
    createFromRunsMock.mockResolvedValue(saved);
    renderDialog([run("r1", "succeeded")]);
    fireEvent.click(screen.getByRole("button", { name: "Save dataset" }));

    const link = (await screen.findByRole("link", { name: "Open graph" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/graphs/g1");
  });
});
