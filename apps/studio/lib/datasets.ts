import type { Fixture, FixtureDataset, RunSummary } from "@bstockwelldev/agent-graph-sdk";

// Pure helpers for saved Routing Lab datasets (DatasetPicker.tsx) and
// capturing them from run history (runs/[graphId]/page.tsx). Kept out of the
// components so they're unit-testable without rendering.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses the Routing Lab's dataset textarea into fixtures, with a specific
 * message per problem instead of letting the backend 422 on a bad shape.
 * `node_outputs` is optional in the text (a bare `{input}` fixture is
 * common) and defaults to `{}`.
 */
export function fixturesFromText(text: string): Fixture[] {
  const parsed: unknown = JSON.parse(text.trim() === "" ? "[]" : text);
  if (!Array.isArray(parsed)) throw new Error("Dataset must be a JSON array of fixtures");
  return parsed.map((item: unknown, index) => {
    if (!isPlainObject(item)) throw new Error(`Fixture ${index + 1} must be an object`);
    const { input = {}, node_outputs: nodeOutputs = {} } = item;
    if (!isPlainObject(input)) throw new Error(`Fixture ${index + 1}: input must be a JSON object`);
    if (!isPlainObject(nodeOutputs)) throw new Error(`Fixture ${index + 1}: node_outputs must be a JSON object`);
    return { input, node_outputs: nodeOutputs };
  });
}

export function fixturesToText(fixtures: Fixture[]): string {
  return JSON.stringify(fixtures, null, 2);
}

export function newDatasetId(): string {
  return `ds_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** "3 fixtures · from runs" — the one-line label used in the saved-dataset picker. */
export function describeDataset(dataset: FixtureDataset): string {
  const count = dataset.fixtures.length;
  const base = `${dataset.name} (${count} fixture${count === 1 ? "" : "s"}`;
  return dataset.source === "runs" ? `${base} · from runs)` : `${base})`;
}

/**
 * The dataset to persist for a save. With `existing`, keeps its identity,
 * provenance, and creation time and only replaces name + fixtures; without
 * it, mints a new manual dataset. `updated_at` is stamped by the client
 * because the generic CRUD route stores exactly the body it's sent.
 */
export function buildDatasetForSave({
  name,
  fixtures,
  existing,
  now = new Date(),
}: {
  name: string;
  fixtures: Fixture[];
  existing?: FixtureDataset | null;
  now?: Date;
}): FixtureDataset {
  const timestamp = now.toISOString();
  if (existing) {
    return { ...existing, name, fixtures, updated_at: timestamp };
  }
  return {
    id: newDatasetId(),
    name,
    description: null,
    graph_id: null,
    fixtures,
    source: "manual",
    source_run_ids: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
}

/**
 * Runs that can't have their node outputs frozen into a dataset: only a
 * `succeeded` run has a complete set of outputs (mirrors
 * backend/app/datasets.py). Capturing inputs only has no such limit.
 */
export function runsBlockingFrozenCapture(runs: RunSummary[]): RunSummary[] {
  return runs.filter((run) => run.status !== "succeeded");
}

export function defaultCaptureName(graphId: string, count: number, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${graphId} · ${count} run${count === 1 ? "" : "s"} · ${day}`;
}
