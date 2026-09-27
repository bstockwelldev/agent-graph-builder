import { devices } from "@playwright/test";

import { expect, test } from "../fixtures";

test.use({ ...devices["iPhone 13"], defaultBrowserType: undefined });

test("on a phone the graph runs from the drawer and nodes can be added", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E mobile");
  await page.goto(`/graphs/${graph.id}?panel=run`);
  await expect(page.locator(".react-flow__node")).toHaveCount(graph.nodes.length);

  // No horizontal page scroll at phone width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The run panel is a modal drawer on phones.
  const drawer = page.getByRole("dialog", { name: "Run" });
  await drawer.getByRole("button", { name: /^Run/ }).click();
  await expect(drawer.getByText(/A database index is a data structure/).first()).toBeVisible();

  await page.goto(`/graphs/${graph.id}`);
  await page.getByRole("button", { name: "Add", exact: true }).click(); // bottom tab bar
  await page.getByRole("dialog", { name: "Add node" }).getByRole("button", { name: /^Transform/ }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(graph.nodes.length + 1);
});
