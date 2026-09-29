import type { Page } from "@playwright/test";

import { expect, openGraph, save, test, waitForCanvasToSettle } from "../fixtures";

// Canvas editing beyond adding and wiring nodes: delete, undo/redo,
// duplicate, context menus, find, dependency view and layout.
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const counts = (page: Page) => page.getByText(/^\d+ nodes · \d+ edges$/);
const status = (page: Page) => page.getByRole("status").first();
const clearSelection = (page: Page) => page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });

test("deletes a node with the keyboard, and undo/redo walk it back and forth", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E undo");
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  await expect(counts(page)).toHaveText("8 nodes · 8 edges");
  await expect(status(page)).toHaveText("Saved");

  await node(page, "tool_lookup").click();
  await page.keyboard.press("Delete");
  await expect(node(page, "tool_lookup")).toHaveCount(0);
  // Its two edges go with it.
  await expect(counts(page)).toHaveText("7 nodes · 6 edges");
  await expect(status(page)).toHaveText("Unsaved");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(node(page, "tool_lookup")).toBeVisible();
  await expect(counts(page)).toHaveText("8 nodes · 8 edges");
  // Undoing back to the saved graph is clean again.
  await expect(status(page)).toHaveText("Saved");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(node(page, "tool_lookup")).toHaveCount(0);
  await save(page);
  const saved = await api.getGraph(graph.id);
  expect(saved.nodes.map((n: { id: string }) => n.id)).not.toContain("tool_lookup");
  expect(saved.edges).toHaveLength(6);
});

test("duplicates a node and deletes an edge from context menus", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E context menus");
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await node(page, "llm_answer").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate node" }).click();
  await expect(counts(page)).toHaveText("9 nodes · 8 edges");
  await expect(page.locator(".react-flow__node-llm")).toHaveCount(3);

  await page.getByRole("group", { name: "Edge from llm_answer to output_1" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete edge" }).click();
  await expect(counts(page)).toHaveText("9 nodes · 7 edges");
  await expect(page.getByRole("group", { name: "Edge from llm_answer to output_1" })).toHaveCount(0);

  await save(page);
  const saved = await api.getGraph(graph.id);
  expect(saved.nodes).toHaveLength(9);
  expect(saved.edges.some((e: { source: string; target: string }) => e.source === "llm_answer" && e.target === "output_1")).toBe(false);
});

test("finds nodes on the canvas and shows a node's upstream", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E find");
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  const card = (id: string) => node(page, id).getByTestId("graph-node-card");

  await clearSelection(page);
  await page.keyboard.press("ControlOrMeta+f");
  const find = page.getByRole("search", { name: "Find on canvas" });
  await find.getByRole("textbox", { name: "Find nodes" }).fill("type:llm");
  await expect(find.getByRole("status")).toHaveText(/^1 of 2\b/);
  // The first Next jumps to the current match; the next one moves on.
  await find.getByRole("button", { name: "Next match" }).click();
  await expect(find.getByRole("status")).toHaveText(/^1 of 2\b/);
  await find.getByRole("button", { name: "Next match" }).click();
  await expect(find.getByRole("status")).toHaveText(/^2 of 2\b/);
  // Non-matches dim; matches stay lit.
  await expect(card("llm_classify")).toHaveCSS("opacity", "1");
  await expect(card("tool_lookup")).toHaveCSS("opacity", "0.35");
  await find.getByRole("button", { name: "Close find" }).click();
  await expect(find).toBeHidden();
  await expect(card("tool_lookup")).toHaveCSS("opacity", "1");

  // Jumping to the last match zoomed in on it; fit the graph back into view.
  await expect(node(page, "router_1")).not.toBeInViewport();
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("menuitem", { name: "Fit view" }).click();
  await waitForCanvasToSettle(page);
  await expect(node(page, "router_1")).toBeInViewport();

  await node(page, "router_1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Show upstream" }).click();
  const banner = page.getByRole("status").filter({ hasText: "Upstream of router_1" });
  await expect(banner).toBeVisible();
  for (const id of ["input_1", "prompt_classify", "llm_classify", "router_1"]) await expect(card(id)).toHaveCSS("opacity", "1");
  for (const id of ["tool_lookup", "llm_answer", "output_1"]) await expect(card(id)).toHaveCSS("opacity", "0.35");
  await banner.getByRole("button", { name: "Clear" }).click();
  await expect(banner).toBeHidden();
  await expect(card("output_1")).toHaveCSS("opacity", "1");
});

test("switches layout direction and auto-arranges", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E layout");
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  const box = async (id: string) => (await node(page, id).boundingBox())!;

  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Vertical" }).click();
  await waitForCanvasToSettle(page);
  // Vertical: each step sits below the one before it.
  await expect.poll(async () => (await box("output_1")).y > (await box("input_1")).y + 200).toBe(true);

  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Horizontal" }).click();
  await waitForCanvasToSettle(page);
  await expect.poll(async () => (await box("output_1")).x > (await box("input_1")).x + 200).toBe(true);

  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Horizontal" })).toBeChecked();
  await page.getByRole("menuitem", { name: "Auto-arrange now" }).click();
  await waitForCanvasToSettle(page);
  await expect(node(page, "output_1")).toBeInViewport();
});
