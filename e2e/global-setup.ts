import { CoverageReport } from "monocart-coverage-reports";

import { coverageEnabled, coverageOptions } from "./coverage";

/** Coverage runs start from an empty cache, so the report covers this run only. */
export default async function globalSetup(): Promise<void> {
  if (coverageEnabled) new CoverageReport(coverageOptions).cleanCache();
}
