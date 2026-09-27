#!/usr/bin/env node
// Prints a Markdown coverage table (for $GITHUB_STEP_SUMMARY) from
// `label=path` pairs. Each path is a Vitest json-summary
// (coverage/coverage-summary.json) or a coverage.py JSON report
// (pytest --cov-report=json). Report-only: no thresholds.
import { readFileSync } from "node:fs";

const pct = (value) => `${Number(value).toFixed(1)}%`;

const rows = process.argv.slice(2).map((arg) => {
  const [label, path] = arg.split("=");
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.total) {
    const { lines, branches } = report.total;
    return `| ${label} | ${pct(lines.pct)} | ${pct(branches.pct)} | ${lines.covered}/${lines.total} |`;
  }
  const totals = report.totals;
  const branches = totals.num_branches ? pct((100 * totals.covered_branches) / totals.num_branches) : "n/a";
  return `| ${label} | ${pct(totals.percent_covered)} | ${branches} | ${totals.covered_lines}/${totals.num_statements} |`;
});

console.log(["| Package | Lines | Branches | Covered |", "| --- | --- | --- | --- |", ...rows].join("\n"));
