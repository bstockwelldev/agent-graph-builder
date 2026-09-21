import type { FixtureDataset, RunSummary } from "@bstockwelldev/agent-graph-sdk";
import { describe, expect, it } from "vitest";

import {
  buildDatasetForSave,
  defaultCaptureName,
  describeDataset,
  fixturesFromText,
  fixturesToText,
  newDatasetId,
  runsBlockingFrozenCapture,
} from "./datasets";

const dataset: FixtureDataset = {
  id: "ds_1",
  name: "Captured",
  description: "d",
  graph_id: "g1",
  fixtures: [{ input: { q: "a" }, node_outputs: { n1: "x" } }],
  source: "runs",
  source_run_ids: ["r1"],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("fixturesFromText", () => {
  it("treats empty text as an empty dataset", () => {
    expect(fixturesFromText("")).toEqual([]);
    expect(fixturesFromText("   ")).toEqual([]);
  });

  it("defaults a missing node_outputs to an empty object", () => {
    expect(fixturesFromText('[{"input":{"q":"a"}}]')).toEqual([{ input: { q: "a" }, node_outputs: {} }]);
  });

  it("round-trips through fixturesToText", () => {
    expect(fixturesFromText(fixturesToText(dataset.fixtures))).toEqual(dataset.fixtures);
  });

  it("rejects non-array JSON", () => {
    expect(() => fixturesFromText('{"input":{}}')).toThrow("Dataset must be a JSON array of fixtures");
  });

  it("names the offending fixture for a non-object entry", () => {
    expect(() => fixturesFromText('[{"input":{}}, 5]')).toThrow("Fixture 2 must be an object");
  });

  it("names the offending fixture for a non-object input or node_outputs", () => {
    expect(() => fixturesFromText('[{"input":"x"}]')).toThrow("Fixture 1: input must be a JSON object");
    expect(() => fixturesFromText('[{"input":{},"node_outputs":[]}]')).toThrow(
      "Fixture 1: node_outputs must be a JSON object",
    );
  });

  it("propagates a JSON syntax error", () => {
    expect(() => fixturesFromText("[{")).toThrow(SyntaxError);
  });
});

describe("describeDataset", () => {
  it("pluralises fixtures and marks run-captured datasets", () => {
    expect(describeDataset(dataset)).toBe("Captured (1 fixture · from runs)");
    expect(describeDataset({ ...dataset, source: "manual", fixtures: [] })).toBe("Captured (0 fixtures)");
  });
});

describe("buildDatasetForSave", () => {
  const now = new Date("2026-02-03T04:05:06.000Z");

  it("mints a new manual dataset with a fresh id", () => {
    const built = buildDatasetForSave({ name: "New", fixtures: dataset.fixtures, now });
    expect(built.id).toMatch(/^ds_[0-9a-f]{12}$/);
    expect(built).toMatchObject({
      name: "New",
      source: "manual",
      source_run_ids: [],
      graph_id: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  });

  it("keeps identity and provenance when updating an existing dataset", () => {
    const built = buildDatasetForSave({ name: "Renamed", fixtures: [], existing: dataset, now });
    expect(built).toEqual({
      ...dataset,
      name: "Renamed",
      fixtures: [],
      updated_at: now.toISOString(),
    });
    expect(built.created_at).toBe(dataset.created_at);
  });

  it("mints distinct ids", () => {
    expect(newDatasetId()).not.toBe(newDatasetId());
  });
});

describe("runsBlockingFrozenCapture", () => {
  const run = (status: RunSummary["status"], run_id: string) => ({ run_id, status }) as RunSummary;

  it("flags every run that isn't succeeded", () => {
    const blocking = runsBlockingFrozenCapture([
      run("succeeded", "a"),
      run("failed", "b"),
      run("paused", "c"),
      run("running", "d"),
    ]);
    expect(blocking.map((r) => r.run_id)).toEqual(["b", "c", "d"]);
  });

  it("flags nothing when every run succeeded", () => {
    expect(runsBlockingFrozenCapture([run("succeeded", "a")])).toEqual([]);
  });
});

describe("defaultCaptureName", () => {
  it("includes the graph, run count and date", () => {
    const now = new Date("2026-02-03T10:00:00.000Z");
    expect(defaultCaptureName("g1", 1, now)).toBe("g1 · 1 run · 2026-02-03");
    expect(defaultCaptureName("g1", 5, now)).toBe("g1 · 5 runs · 2026-02-03");
  });
});
