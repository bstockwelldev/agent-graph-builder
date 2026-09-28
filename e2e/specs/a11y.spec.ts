import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { API_URL, expect, openGraph, test, type GraphJson } from "../fixtures";

/**
 * WCAG 2.1 A/AA scan of the main surfaces. Serious or critical violations
 * fail the test, except the known ones below. Each known entry is a real
 * issue to fix; delete it from the list when it's fixed (the test notes any
 * entry that no longer occurs). Keep it empty: a new entry needs a reason.
 */
const KNOWN: Record<string, string[]> = {};

const PAGES: [string, (page: Page, graph: GraphJson) => Promise<void>][] = [
  ["graph library", async (page) => void (await page.goto("/"))],
  ["editor", (page, graph) => openGraph(page, graph)],
  ["run panel", (page, graph) => openGraph(page, graph, "?panel=run")],
  ["node inspector", (page, graph) => openGraph(page, graph, "?node=llm_answer")],
  ["releases panel", (page, graph) => openGraph(page, graph, "?panel=releases")],
  // Seed a card / an exception row first so the scan covers them, not an empty state.
  [
    "transforms",
    async (page) => {
      await page.request.post(`${API_URL}/api/transforms`, {
        data: { id: `a11y_${Date.now()}`, name: `A11y transform ${Date.now()}`, type: "format_message", template: "{value}" },
      });
      await page.goto("/transforms");
      await page.getByRole("button", { name: /^Edit transform A11y transform/ }).first().waitFor();
    },
  ],
  [
    "policies",
    async (page, graph) => {
      const expires = new Date(Date.now() + 86_400_000).toISOString();
      await page.request.post(`${API_URL}/api/graphs/${graph.id}/policy-exceptions`, {
        data: { policy_code: "POLICY_LLM_MODEL_NOT_PINNED", reason: "a11y scan", expires_at: expires },
      });
      await page.goto("/policies");
      await page.getByRole("link", { name: graph.id }).or(page.getByRole("link", { name: graph.name })).first().waitFor();
    },
  ],
  // Every other graph-editor panel, and the run panel after a run finishes.
  ...(["routingLab", "knowledge", "policies", "health", "graphConfig", "chat", "console", "help", "palette"] as const).map(
    (panel): [string, (page: Page, graph: GraphJson) => Promise<void>] => [`${panel} panel`, (page, graph) => openGraph(page, graph, `?panel=${panel}`)],
  ),
  [
    "finished run",
    async (page, graph) => {
      await openGraph(page, graph, "?panel=run");
      await page.getByRole("button", { name: "Run", exact: true }).click();
      await page.getByText(/A database index is a data structure/).first().waitFor();
    },
  ],
  // The remaining top-level pages (resource pages share the card markup scanned on /transforms).
  ...["/agents", "/prompts", "/tools", "/mcp", "/llm-profiles", "/analytics", "/runs", "/resources", "/genui"].map(
    (path): [string, (page: Page, graph: GraphJson) => Promise<void>] => [`${path} page`, async (page) => void (await page.goto(path))],
  ),
];

for (const [name, open] of PAGES) {
  test(`${name} has no new serious accessibility violations`, async ({ page, api }) => {
    const graph = await api.createDemoGraph(`E2E a11y ${name}`);
    await open(page, graph);
    await page.waitForLoadState("networkidle");

    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const known = KNOWN[name] ?? [];
    const unexpected = serious
      .filter((v) => !known.includes(v.id))
      .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
    expect(unexpected, "new serious/critical accessibility violations").toEqual([]);

    for (const id of known.filter((id) => !serious.some((v) => v.id === id))) {
      test.info().annotations.push({ type: "fixed", description: `${id} no longer occurs on ${name}; remove it from KNOWN` });
    }
  });
}
