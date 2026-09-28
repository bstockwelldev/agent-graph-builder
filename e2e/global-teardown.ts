import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CoverageReport } from "monocart-coverage-reports";

import { coverageEnabled, coverageOptions } from "./coverage";

/** Deletes the throwaway SQLite databases and, for coverage runs, writes the report. */
export default async function globalTeardown(): Promise<void> {
  for (const dbPath of [process.env.E2E_GRAPH_DB_PATH, process.env.E2E_DEMO_GRAPH_DB_PATH]) {
    if (dbPath) rmSync(dbPath, { force: true });
  }
  if (!coverageEnabled) return;
  const results = await new CoverageReport(coverageOptions).generate();
  if (!results) return;
  const { lines, branches } = results.summary;
  const total = {
    lines: { total: lines.total, covered: lines.covered, pct: lines.pct },
    branches: { total: branches.total, covered: branches.covered, pct: branches.pct },
  };
  writeFileSync(path.join(coverageOptions.outputDir!, "coverage-summary.json"), JSON.stringify({ total }, null, 2));
}
