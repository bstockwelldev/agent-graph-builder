import { defineConfig, devices } from "@playwright/test";

/**
 * Production smoke test: read-mostly checks against a deployed studio
 * (`SMOKE_BASE_URL`, e.g. the production URL, which lives with the operator,
 * not in this repo). No web servers are started. Run nightly by
 * .github/workflows/prod-smoke.yml, or locally:
 *   SMOKE_BASE_URL=https://… pnpm --filter @bstockwelldev/agent-graph-e2e run smoke
 */
const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) throw new Error("SMOKE_BASE_URL is required (the deployed studio's URL)");

export default defineConfig({
  testDir: "./smoke",
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 900 } } }],
});
