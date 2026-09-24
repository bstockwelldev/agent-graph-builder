import type { RunSummary } from "../types.js";

/**
 * The run's input variables (Wave 2.5 run console: "one field per input
 * variable"). Each input node reads `run.input[config.variableName]`
 * (backend/app/nodes.py `compute_input`), so the distinct variable names of
 * the graph's input nodes -- in node order -- are exactly the fields a run
 * needs. Falls back to the backend's own default, `question`.
 */
export function runInputVariables(nodes: readonly { type: string; config?: Record<string, unknown> }[]): string[] {
  const names: string[] = [];
  for (const node of nodes) {
    if (node.type !== "input") continue;
    const raw = node.config?.variableName;
    const name = typeof raw === "string" && raw.trim() ? raw.trim() : "question";
    if (!names.includes(name)) names.push(name);
  }
  return names.length > 0 ? names : ["question"];
}

/** Distinct previous values for one input variable, newest first. */
export function recentInputValues(runs: Pick<RunSummary, "input">[], variable: string, limit = 8): string[] {
  const values: string[] = [];
  for (const run of runs) {
    const value = run.input?.[variable];
    if (typeof value !== "string" || !value.trim() || values.includes(value)) continue;
    values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

/** Compact one-line label for a run's inputs, e.g. "topic: TCP · audience: kids". */
export function formatRunInputs(input: Record<string, unknown> | undefined, max = 60): string {
  const entries = Object.entries(input ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (entries.length === 0) return "";
  const text =
    entries.length === 1
      ? String(entries[0][1])
      : entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
