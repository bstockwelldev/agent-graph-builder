import path from "node:path";

import type { APIRequestContext } from "@playwright/test";
import { CoverageReport, type CoverageReportOptions } from "monocart-coverage-reports";

/**
 * Studio client coverage from the e2e run (report-only). With E2E_COVERAGE=1
 * the studio is built with browser source maps, each test's page collects V8
 * JS coverage (Chromium), and the global teardown maps it back to the studio
 * sources and writes an HTML report plus coverage/coverage-summary.json (the
 * V8 totals in the Istanbul summary shape scripts/coverage-summary.mjs reads;
 * MCR's own Istanbul summary undercounts files no test loaded).
 */
export const coverageEnabled = process.env.E2E_COVERAGE === "1";

const STUDIO_SOURCE = /(^|\/)(app|components|content|hooks|layout|lib)\/.+\.(tsx?|jsx?)$/;

export const coverageOptions: CoverageReportOptions = {
  name: "Studio e2e coverage",
  outputDir: path.join(__dirname, "coverage"),
  entryFilter: (entry) => entry.url.includes("/_next/static/chunks/"),
  sourceFilter: (sourcePath) => !sourcePath.includes("node_modules") && STUDIO_SOURCE.test(sourcePath),
  sourcePath: (filePath) => filePath.replace(/^.*?apps\/studio\//, ""),
  // Count studio files no test loaded as 0%, so the total is comparable to the
  // unit-test number (vitest's coverage.include covers the same directories).
  all: {
    dir: ["app", "components", "content", "hooks", "layout", "lib"].map((dir) => path.join(__dirname, "../apps/studio", dir)),
    filter: (filePath: string) => /\.(tsx?|jsx?)$/.test(filePath) && !/\.test\.|\.d\.ts$/.test(filePath),
  },
  reports: ["console-summary", ["html", { subdir: "html" }]],
};

type V8Entry = { url: string; source?: string; sourceMap?: unknown };

/** Attaches each chunk's source map (served next to it in coverage builds). */
export async function withSourceMaps(entries: V8Entry[], request: APIRequestContext): Promise<V8Entry[]> {
  const chunks = entries.filter((entry) => entry.url.includes("/_next/static/chunks/"));
  await Promise.all(
    chunks.map(async (entry) => {
      const response = await request.get(`${entry.url}.map`).catch(() => null);
      if (response?.ok()) entry.sourceMap = await response.json().catch(() => undefined);
    }),
  );
  return chunks;
}

export async function addCoverage(entries: V8Entry[]): Promise<void> {
  await new CoverageReport(coverageOptions).add(entries as never);
}
