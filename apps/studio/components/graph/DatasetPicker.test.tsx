import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FixtureDataset } from "@bstockwelldev/agent-graph-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DatasetPicker } from "./DatasetPicker";

const { datasetsMock } = vi.hoisted(() => ({
  datasetsMock: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/api-client", () => ({ client: { datasets: datasetsMock } }));

const fixtures = [{ input: { q: "a" }, node_outputs: {} }];
const older: FixtureDataset = {
  id: "ds_old",
  name: "Older set",
  description: null,
  graph_id: null,
  fixtures,
  source: "manual",
  source_run_ids: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};
const newer: FixtureDataset = {
  ...older,
  id: "ds_new",
  name: "Captured set",
  source: "runs",
  source_run_ids: ["r1"],
  fixtures: [...fixtures, ...fixtures],
  updated_at: "2026-02-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(datasetsMock).forEach((fn) => fn.mockReset());
  datasetsMock.list.mockResolvedValue([older, newer]);
});
afterEach(() => cleanup());

function renderPicker(overrides: Partial<Parameters<typeof DatasetPicker>[0]> = {}) {
  const onLoad = vi.fn();
  const getFixtures = vi.fn(() => fixtures);
  render(<DatasetPicker getFixtures={getFixtures} onLoad={onLoad} {...overrides} />);
  return { onLoad, getFixtures };
}

async function choose(id: string) {
  const select = (await screen.findByLabelText("Saved dataset")) as HTMLSelectElement;
  await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
  fireEvent.change(select, { target: { value: id } });
}

describe("DatasetPicker", () => {
  it("lists saved datasets newest-updated first with a source-aware label", async () => {
    renderPicker();
    const select = (await screen.findByLabelText("Saved dataset")) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));

    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Choose a dataset…",
      "Captured set (2 fixtures · from runs)",
      "Older set (1 fixture)",
    ]);
  });

  it("shows a prompt when nothing is saved yet", async () => {
    datasetsMock.list.mockResolvedValue([]);
    renderPicker();
    expect(await screen.findByText("No saved datasets yet")).toBeTruthy();
  });

  it("loads the chosen dataset's fixtures into the editor and remembers its name", async () => {
    const { onLoad } = renderPicker();
    await choose("ds_new");
    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    expect(onLoad).toHaveBeenCalledWith(newer.fixtures);
    expect((screen.getByLabelText("Dataset name") as HTMLInputElement).value).toBe("Captured set");
    expect(screen.getByRole("button", { name: /Update/ })).toBeTruthy();
  });

  it("saves the editor's fixtures as a new dataset", async () => {
    datasetsMock.create.mockImplementation(async (dataset: FixtureDataset) => dataset);
    const { getFixtures } = renderPicker();
    await screen.findByLabelText("Saved dataset");

    fireEvent.change(screen.getByLabelText("Dataset name"), { target: { value: "  Fresh  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save as new" }));

    await waitFor(() => expect(datasetsMock.create).toHaveBeenCalledTimes(1));
    const sent = datasetsMock.create.mock.calls[0]?.[0] as FixtureDataset;
    expect(getFixtures).toHaveBeenCalled();
    expect(sent).toMatchObject({ name: "Fresh", fixtures, source: "manual" });
    expect(sent.id).toMatch(/^ds_/);
    expect(await screen.findByRole("button", { name: /Update .Fresh./ })).toBeTruthy();
  });

  it("updates the loaded dataset in place, keeping its id and provenance", async () => {
    datasetsMock.update.mockImplementation(async (dataset: FixtureDataset) => dataset);
    renderPicker();
    await choose("ds_new");
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    fireEvent.click(screen.getByRole("button", { name: /Update/ }));

    await waitFor(() => expect(datasetsMock.update).toHaveBeenCalledTimes(1));
    expect(datasetsMock.update.mock.calls[0]?.[0]).toMatchObject({
      id: "ds_new",
      source: "runs",
      source_run_ids: ["r1"],
      fixtures,
    });
    expect(datasetsMock.create).not.toHaveBeenCalled();
  });

  it("refuses to save without a name", async () => {
    renderPicker();
    await screen.findByLabelText("Saved dataset");
    fireEvent.click(screen.getByRole("button", { name: "Save as new" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Give the dataset a name first.");
    expect(datasetsMock.create).not.toHaveBeenCalled();
  });

  it("surfaces the editor's parse error instead of saving", async () => {
    renderPicker({
      getFixtures: () => {
        throw new Error("Fixture 2 must be an object");
      },
    });
    await screen.findByLabelText("Saved dataset");
    fireEvent.change(screen.getByLabelText("Dataset name"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as new" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Fixture 2 must be an object");
    expect(datasetsMock.create).not.toHaveBeenCalled();
  });

  it("requires a confirm click to delete and then drops it from the list", async () => {
    datasetsMock.delete.mockResolvedValue({ deleted: true });
    renderPicker();
    await choose("ds_old");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(datasetsMock.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(datasetsMock.delete).toHaveBeenCalledWith("ds_old"));
    const select = screen.getByLabelText("Saved dataset") as HTMLSelectElement;
    await waitFor(() => expect([...select.options].map((o) => o.value)).not.toContain("ds_old"));
  });

  it("still works when the list request fails", async () => {
    datasetsMock.list.mockRejectedValue(new Error('GET /api/datasets failed (500): {"detail":"db down"}'));
    renderPicker();

    expect((await screen.findByRole("alert")).textContent).toContain("db down");
    expect(screen.getByRole("button", { name: "Save as new" })).toBeTruthy();
  });
});
