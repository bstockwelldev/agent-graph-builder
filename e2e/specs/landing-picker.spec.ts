import { API_URL, expect, openGraph, test, waitForCanvasToSettle } from "../fixtures";

// Canvas-first landing plan, Phase 1: `/` opens a graph, and choosing one
// happens in a modal over the canvas. Each test starts in a fresh browser
// context, so there is no last graph until one is opened.

const LAST_GRAPH_KEY = "agb:last-graph";

test("with no last graph, / shows the empty canvas with the picker open, and Escape leaves the call to action", async ({ page }) => {
  await page.goto("/");
  const picker = page.getByRole("dialog", { name: "Open graph" });
  await expect(picker).toBeVisible();
  // Each seeded demo appears once, under Demos.
  const demos = picker.getByRole("region", { name: "Seeded demos" });
  const demo = demos.getByRole("link", { name: /Classify & Route/ });
  await expect(demo).toHaveCount(1);
  // Forks of it (made by other specs) belong in Recent; the demo itself, by id, does not.
  const demoHref = (await demo.getAttribute("href"))!;
  await expect(picker.getByRole("region", { name: "Recent graphs" }).locator(`a[href="${demoHref}"]`)).toHaveCount(0);
  await expect(picker.locator(`a[href="${demoHref}"]`)).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(page.getByTestId("empty-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Open or create a graph" }).click();
  await expect(picker).toBeVisible();
});

test("opening a graph makes / reopen it, keeping ?panel=", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E landing ${Date.now()}`);
  await openGraph(page, graph);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), LAST_GRAPH_KEY)).toBe(graph.id);

  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`/graphs/${graph.id}$`));
  await expect(page.locator(".react-flow__node")).toHaveCount(graph.nodes.length);

  await page.goto("/?panel=notes");
  await expect(page).toHaveURL(new RegExp(`/graphs/${graph.id}\\?panel=notes`));
  await expect(page.getByRole("button", { name: "Close Notes" })).toBeVisible();
});

test("a deleted last graph lands on the picker, not an error", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph(`E2E landing deleted ${Date.now()}`);
  await openGraph(page, graph);
  expect((await request.delete(`${API_URL}/api/graphs/${graph.id}`)).ok()).toBe(true);

  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Open graph" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), LAST_GRAPH_KEY)).toBeNull();
});

test("⌘O and the header's Browse all… open the picker from a graph; choosing one changes the route; Escape closes", async ({ page, api }) => {
  const stamp = Date.now();
  const current = await api.createDemoGraph(`E2E picker current ${stamp}`);
  const other = await api.createDemoGraph(`E2E picker other ${stamp}`);
  await openGraph(page, current);
  await waitForCanvasToSettle(page);

  const picker = page.getByRole("dialog", { name: "Open graph" });
  await page.keyboard.press("ControlOrMeta+o");
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("link", { name: new RegExp(current.name) })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();

  await page.getByRole("button", { name: current.name }).first().click();
  await page.getByRole("option", { name: /Browse all/ }).click();
  await expect(picker).toBeVisible();
  await picker.getByRole("searchbox", { name: "Search graphs" }).fill(other.name);
  await picker.getByRole("link", { name: new RegExp(other.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/graphs/${other.id}`));
  await expect(picker).toBeHidden();
});

test("the command palette lists Open graph…", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E picker palette ${Date.now()}`);
  await openGraph(page, graph);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/canvas action/).fill("open graph");
  await page.getByRole("option", { name: /^Open graph/ }).click();
  await expect(page.getByRole("dialog", { name: "Open graph" })).toBeVisible();
});

test("you can delete your own graphs from the picker, behind a confirm, and demos have no delete", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E picker delete ${Date.now()}`);
  await page.goto("/?open=picker");
  const picker = page.getByRole("dialog", { name: "Open graph" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: /^Delete Classify & Route/ })).toHaveCount(0);

  await picker.getByRole("button", { name: `Delete ${graph.name}` }).click();
  await page.getByRole("dialog", { name: "Delete graph" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(picker.getByText(graph.name)).toHaveCount(0);
  await expect.poll(async () => (await page.request.get(`${API_URL}/api/graphs/${graph.id}`)).status()).toBe(404);
});

test("a phone opens the picker from the tray's Graphs button", async ({ page, api }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const graph = await api.createDemoGraph(`E2E picker phone ${Date.now()}`);
  await page.goto(`/graphs/${graph.id}`);
  await page.getByRole("navigation", { name: "Graph actions" }).getByRole("button", { name: "Graphs" }).click();
  await expect(page.getByRole("dialog", { name: "Open graph" })).toBeVisible();
});
