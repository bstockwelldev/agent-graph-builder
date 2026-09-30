import type { Page } from "@playwright/test";

import { expect, openGraph, test } from "../fixtures";

// canvas-workbench-ergonomics-plan.md, slice A: the right-click menu's hover
// highlight, focus mode as a neighborhood, and the build line in Help.

function cardOpacity(page: Page, nodeId: string) {
  return page.locator(`.react-flow__node[data-id="${nodeId}"] [data-status]`).evaluate((el) => getComputedStyle(el).opacity);
}

test("the right-click menu highlights the item under the pointer", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E menu hover ${Date.now()}`);
  await openGraph(page, graph);
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await page.mouse.click(pane.x + 30, pane.y + pane.height / 2, { button: "right" });
  const item = page.getByRole("menuitem", { name: "LLM node" });
  await item.hover();
  await expect(item).toBeFocused();
  await expect.poll(() => item.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
});

test("focus mode lights the selected node and its neighbors, and dims the rest", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E focus mode ${Date.now()}`);
  await openGraph(page, graph);
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Focus mode: select a node" })).toBeVisible();
  await expect.poll(() => cardOpacity(page, "input_1")).toBe("1");

  await page.locator('.react-flow__node[data-id="llm_classify"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Focus mode: select a node" })).toHaveCount(0);
  // Lit: llm_classify and its neighbors. Before, selecting it lit the whole demo graph.
  for (const id of ["llm_classify", "prompt_classify", "router_1"]) await expect.poll(() => cardOpacity(page, id)).toBe("1");
  for (const id of ["input_1", "tool_lookup", "llm_answer", "output_1"]) await expect.poll(() => cardOpacity(page, id)).toBe("0.35");
});

test("Help shows which commit the studio and API run", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E build line ${Date.now()}`);
  await openGraph(page, graph);
  await page.keyboard.press("?");
  // Local builds have no commit.
  await expect(page.getByLabel("Build")).toHaveText(/^Studio \S+ · API \S+/);
  await expect(page.getByLabel("Build")).not.toContainText("…");
});
