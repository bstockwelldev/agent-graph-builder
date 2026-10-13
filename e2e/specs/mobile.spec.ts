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
  // The phone header shows only a dot; the state is still announced.
  await expect(page.getByRole("status").first()).toHaveText("Unsaved");
});

test("the viewport opts into viewport-fit=cover so the bottom tray clears the home indicator", async ({ page, api }) => {
  // Regression test for the "tray not selectable" iPhone report: without
  // `viewport-fit=cover` iOS Safari reports zero safe-area insets, the
  // tray's `pb-[env(safe-area-inset-bottom)]` collapses to 0, and the tabs
  // land inside the home-indicator gesture zone where taps never reach them.
  const graph = await api.createDemoGraph("E2E mobile viewport");
  await page.goto(`/graphs/${graph.id}`);
  const content = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(content).toContain("viewport-fit=cover");
});
