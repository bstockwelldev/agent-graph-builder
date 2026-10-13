import { API_URL, expect, openGraph, test } from "../fixtures";

// Canvas-first landing plan, Phase 3 (§2, §7 AC 4): every retired route
// redirects to a panel showing the same data. One parameterized spec over the
// plan's table. A fresh browser context has no last graph, so the redirect
// lands on the empty canvas at `/` and the panel floats there; the last tests
// show the same links with a graph to reopen.

const PANEL_ROUTES = [
  ["/agents", "agents", "Agents"],
  ["/prompts", "prompts", "Prompts"],
  ["/tools", "tools", "Tools"],
  ["/mcp", "mcp", "MCP"],
  ["/llm-profiles", "llmProfiles", "LLM Profiles"],
  ["/transforms", "transforms", "Transforms"],
  ["/datasets", "datasets", "Datasets"],
  ["/eval-suites", "evalSuites", "Eval suites"],
  ["/resources", "prompts", "Prompts"],
  ["/analytics", "analytics", "Analytics"],
  ["/policies", "workspacePolicies", "Workspace policies"],
  ["/genui", "genui", "GenUI catalog"],
] as const;

for (const [route, panel, title] of PANEL_ROUTES) {
  test(`${route} redirects to the ${title} panel`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`[?&]panel=${panel}(&|$)`));
    await expect(page.getByRole("button", { name: `Close ${title}` })).toBeVisible();
    // The panel, not the picker: that is what was asked for.
    await expect(page.getByRole("dialog", { name: "Open graph" })).toHaveCount(0);
  });
}

for (const route of ["/graphs", "/runs"]) {
  test(`${route} redirects to the empty canvas with the picker open`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("dialog", { name: "Open graph" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
}

test("a resource page link keeps its ?id= and ?tab=", async ({ page, request }) => {
  const id = `e2e_redirect_${Date.now()}`;
  expect((await request.post(`${API_URL}/api/prompts`, { data: { id, name: `Redirect ${id}`, body: "Hi {name}" } })).ok()).toBe(true);
  await page.goto(`/prompts?id=${id}&tab=usage`);
  const dialog = page.getByRole("dialog", { name: "Edit prompt" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Usage/ })).toHaveAttribute("aria-selected", "true");
});

test("with a last graph, a retired link reopens it with the panel docked", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E redirect last graph ${Date.now()}`);
  await openGraph(page, graph);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("agb:last-graph"))).toBe(graph.id);

  await page.goto("/policies");
  await expect(page).toHaveURL(new RegExp(`/graphs/${graph.id}\\?panel=workspacePolicies`));
  await expect(page.getByRole("button", { name: "Close Workspace policies" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(graph.nodes.length);
});

test("an old graph-scoped Analytics link opens that graph's own analytics", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E redirect analytics ${Date.now()}`);
  await page.goto(`/analytics?graph=${graph.id}`);
  await expect(page).toHaveURL(new RegExp(`/graphs/${graph.id}`));
  await expect(page.getByRole("radiogroup", { name: "Analytics scope" }).getByRole("radio", { name: "This graph" })).toBeChecked();
});
