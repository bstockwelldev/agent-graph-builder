import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * The built studio (`next start`) against a live FastAPI backend on the
 * deterministic stub provider, with a throwaway SQLite database per run.
 *
 * The API listens on :8000 because that is the studio's default proxy target
 * (`API_PROXY_TARGET`, baked into the build's rewrites). The studio runs on
 * :3100 so it doesn't collide with `pnpm dev` on :3000.
 *
 * Locally, servers already listening on those ports are reused (start them
 * with the same env for a faithful run); CI always starts its own.
 *
 * A second API on :8001 runs with PUBLIC_DEMO_MODE=1 (the production
 * setting); demo-mode specs route the browser's /api calls to it
 * (the `demoModeApi` fixture in fixtures.ts), since the studio's proxy target is fixed
 * at build time.
 *
 * A fake embedding server on :8123 (scripts/fake-embeddings.mjs) stands in for the
 * Supabase embed function, so the stub API accepts knowledge uploads, and a
 * fake MCP server on :8124 (scripts/fake-mcp.mjs) answers tool discovery and
 * MCP-bound tool calls.
 *
 * E2E_SKIP_BUILD=1 reuses an existing `apps/studio/.next` build; otherwise the
 * studio (and the SDK it imports) is built first.
 */
const API_URL = "http://127.0.0.1:8000";
const FAKE_EMBEDDINGS_URL = "http://127.0.0.1:8123";
const FAKE_MCP_URL = "http://127.0.0.1:8124";
const STUDIO_PORT = 3100;
const repoRoot = path.resolve(__dirname, "..");
const dbPath = (process.env.E2E_GRAPH_DB_PATH ??= path.join(os.tmpdir(), `agent-graph-e2e-${process.pid}.db`));
const demoDbPath = (process.env.E2E_DEMO_GRAPH_DB_PATH ??= path.join(os.tmpdir(), `agent-graph-e2e-demo-${process.pid}.db`));
const studio = "pnpm --filter @bstockwelldev/agent-graph-studio";
const buildStudio = process.env.E2E_SKIP_BUILD ? "" : `${studio} run build && `;

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${STUDIO_PORT}`,
    viewport: { width: 1600, height: 900 },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 900 } } }],
  webServer: [
    {
      command: "node scripts/fake-embeddings.mjs",
      cwd: repoRoot,
      url: FAKE_EMBEDDINGS_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node scripts/fake-mcp.mjs",
      cwd: repoRoot,
      url: FAKE_MCP_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "uv run uvicorn app.main:app --port 8000",
      cwd: path.join(repoRoot, "backend"),
      url: `${API_URL}/api/health`,
      env: {
        GRAPH_DB_PATH: dbPath,
        CHAT_PROVIDER: "stub",
        PUBLIC_DEMO_MODE: "",
        SUPABASE_EMBEDDINGS_URL: `${FAKE_EMBEDDINGS_URL}/embed`,
        SUPABASE_SERVICE_ROLE_KEY: "e2e-fake-embeddings",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "uv run uvicorn app.main:app --port 8001",
      cwd: path.join(repoRoot, "backend"),
      url: "http://127.0.0.1:8001/api/health",
      env: {
        GRAPH_DB_PATH: demoDbPath,
        CHAT_PROVIDER: "stub",
        PUBLIC_DEMO_MODE: "1",
        // Every spec shares one IP here; the per-IP write budgets (STO-626)
        // are covered by backend tests instead.
        PUBLIC_CREATE_LIMIT_PER_HOUR: "10000",
        PUBLIC_CREATE_LIMIT_PER_DAY: "10000",
        PUBLIC_RUN_LIMIT_PER_HOUR: "10000",
        PUBLIC_RUN_LIMIT_PER_DAY: "10000",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `${buildStudio}${studio} exec next start --port ${STUDIO_PORT}`,
      cwd: repoRoot,
      url: `http://127.0.0.1:${STUDIO_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 360_000,
    },
  ],
});
