import { describe, expect, it } from "vitest";
import type { EvalRun } from "@bstockwelldev/agent-graph-sdk";
import { caseVerdict, describeEvalRun, formatDelta, formatScore, formatUsd, scorerLabel, suiteScorerKinds } from "./evals";

const run = (overrides: Partial<EvalRun> = {}): EvalRun => ({
  id: "evr_1",
  suite_id: "s",
  graph_id: "g",
  provider: "stub",
  started_at: "t",
  completed_at: "t",
  score: 0.825,
  cases: [
    { fixture_index: 0, status: "succeeded", passed: true, score: 1 },
    { fixture_index: 1, status: "succeeded", passed: false, score: 0.5 },
    { fixture_index: 2, status: "succeeded", passed: null, score: null },
  ],
  ...overrides,
});

describe("eval helpers", () => {
  it("formats scores, deltas and cost", () => {
    expect([formatScore(0.825), formatScore(null), formatScore(undefined)]).toEqual(["83%", "—", "—"]);
    expect([formatDelta(0.12), formatDelta(-0.05), formatDelta(0), formatDelta(null)]).toEqual(["+12 pts", "−5 pts", "±0 pts", "—"]);
    expect([formatUsd(0), formatUsd(0.004), formatUsd(1.234)]).toEqual(["$0", "<$0.01", "$1.23"]);
  });

  it("names scorers and reads a suite's scorers, defaulting like the backend", () => {
    expect(scorerLabel("json_field")).toBe("JSON fields");
    expect(scorerLabel("custom")).toBe("custom");
    expect(suiteScorerKinds({ scorers: undefined })).toEqual(["exact", "contains", "regex", "json_field", "route"]);
    expect(suiteScorerKinds({ scorers: [{ kind: "rubric" }] })).toEqual(["rubric"]);
  });

  it("gives each case a verdict and each run a one-line summary", () => {
    expect(run().cases!.map(caseVerdict)).toEqual(["pass", "fail", "unscored"]);
    expect(caseVerdict({ fixture_index: 0, status: "blocked" })).toBe("error");
    expect(describeEvalRun(run())).toBe("83% · 1/2 passed · Stub · draft");
    expect(describeEvalRun(run({ provider: "groq", model: "llama", release_id: "rel_1", partial: true, cases: [] }))).toBe(
      "83% · nothing scored · groq · llama · release rel_1 · partial",
    );
  });
});
