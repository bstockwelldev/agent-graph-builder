import type { EvalCaseResult, EvalRun, EvalScorer, EvalSuite } from "@bstockwelldev/agent-graph-sdk";

// Scored evals (backend/app/evals.py): pure helpers for the Evals panel and
// the Eval suites resource page.

export type EvalScorerKind = EvalScorer["kind"];

export const EVAL_SCORERS: { kind: EvalScorerKind; label: string; checks: string }[] = [
  { kind: "exact", label: "Exact", checks: "the output equals expected.output" },
  { kind: "contains", label: "Contains", checks: "the output contains every expected.contains string" },
  { kind: "regex", label: "Regex", checks: "the output matches expected.regex" },
  { kind: "json_field", label: "JSON fields", checks: "expected.json_fields pointers hold their values" },
  { kind: "route", label: "Route", checks: "each router in expected.route picked that node" },
  { kind: "rubric", label: "Rubric", checks: "the output is non-empty, with no {placeholders} or TODOs" },
];

/** What a new suite scores with (the backend's default): everything but the rubric. */
export const DEFAULT_SCORERS: EvalScorerKind[] = ["exact", "contains", "regex", "json_field", "route"];

export function scorerLabel(kind: string): string {
  return EVAL_SCORERS.find((scorer) => scorer.kind === kind)?.label ?? kind;
}

export function suiteScorerKinds(suite: Pick<EvalSuite, "scorers">): EvalScorerKind[] {
  return (suite.scorers ?? DEFAULT_SCORERS.map((kind) => ({ kind }))).map((scorer) => scorer.kind);
}

/** "82%", or "—" when nothing was scored. */
export function formatScore(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

/** "+12 pts" / "−5 pts" / "±0 pts" for a 0–1 delta; "—" when unknown. */
export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const points = Math.round(value * 100);
  return points === 0 ? "±0 pts" : `${points > 0 ? "+" : "−"}${Math.abs(points)} pts`;
}

export function formatUsd(value: number | null | undefined): string {
  if (!value) return "$0";
  return value < 0.01 ? "<$0.01" : `$${value.toFixed(2)}`;
}

export type CaseVerdict = "pass" | "fail" | "unscored" | "error";

export function caseVerdict(item: EvalCaseResult): CaseVerdict {
  if (item.status === "blocked" || item.status === "failed") return "error";
  if (item.passed === true) return "pass";
  if (item.passed === false) return "fail";
  return "unscored";
}

/** One line for a run in the history: "82% · 4/5 passed · Stub · draft". */
export function describeEvalRun(run: EvalRun): string {
  const cases = run.cases ?? [];
  const scored = cases.filter((item) => item.passed !== null && item.passed !== undefined);
  const passed = scored.filter((item) => item.passed).length;
  const target = run.release_id ? `release ${run.release_id}` : "draft";
  const provider = run.provider === "stub" ? "Stub" : run.model ? `${run.provider} · ${run.model}` : run.provider;
  const parts = [formatScore(run.score), scored.length ? `${passed}/${scored.length} passed` : "nothing scored", provider, target];
  if (run.partial) parts.push("partial");
  return parts.join(" · ");
}
