import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, openGraph, test, type GraphJson } from "../fixtures";

/**
 * WCAG 2.1 A/AA scan of the main surfaces. Serious or critical violations
 * fail the test, except the known ones below. Each known entry is a real
 * issue to fix; delete it from the list when it's fixed (the test notes any
 * entry that no longer occurs).
 */
const KNOWN: Record<string, string[]> = {
  // Canvas handles carry aria-label on a div without a role (GraphNodeView).
  // The Run buttons' label color is below 4.5:1 on the accent fill.
  editor: ["aria-prohibited-attr", "color-contrast"],
  "run panel": ["aria-prohibited-attr", "color-contrast"],
  "node inspector": ["aria-prohibited-attr", "color-contrast"],
  "releases panel": ["aria-prohibited-attr", "color-contrast"],
  // Resource cards are role="button" and contain edit/delete buttons (resource-page).
  transforms: ["nested-interactive"],
  // Graph links inside exception rows are distinguished by color only.
  policies: ["link-in-text-block"],
};

const PAGES: [string, (page: Page, graph: GraphJson) => Promise<void>][] = [
  ["graph library", async (page) => void (await page.goto("/"))],
  ["editor", (page, graph) => openGraph(page, graph)],
  ["run panel", (page, graph) => openGraph(page, graph, "?panel=run")],
  ["node inspector", (page, graph) => openGraph(page, graph, "?node=llm_answer")],
  ["releases panel", (page, graph) => openGraph(page, graph, "?panel=releases")],
  ["transforms", async (page) => void (await page.goto("/transforms"))],
  ["policies", async (page) => void (await page.goto("/policies"))],
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
