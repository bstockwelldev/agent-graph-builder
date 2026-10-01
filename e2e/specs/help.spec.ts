import { expect, openGraph, test } from "../fixtures";

// canvas-workbench-ergonomics-plan.md, slice I: one in-app knowledge base,
// reached from "?", the inspector, issues and the command palette.

test("help: search and read articles, open them from the inspector and the command palette", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E help ${Date.now()}`);
  await openGraph(page, graph);

  // "?" opens Help; search finds the article and its related links work.
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Help" });
  await help.getByRole("searchbox", { name: "Search help" }).fill("json pointer");
  await help.getByRole("list", { name: "Help articles" }).getByRole("button").first().click();
  await expect(help.getByRole("heading", { name: "Transforms", exact: true })).toBeVisible();
  await help.getByRole("button", { name: "Transform node" }).click();
  await expect(help.getByRole("heading", { name: "Transform node", exact: true })).toBeVisible();
  await help.getByRole("tab", { name: "Shortcuts" }).click();
  await expect(help.getByText("Toggle help")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);

  // The inspector's help button opens the node type's article.
  await page.locator('.react-flow__node[data-id="router_1"]').click();
  await page.getByRole("button", { name: "Help: Router node" }).click();
  await expect(help.getByRole("heading", { name: "Router node", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // ⌘K ▸ "Help: Fallback edge".
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/search help/).fill("fallback");
  await page.getByRole("option", { name: "Help: Fallback edge" }).click();
  await expect(help.getByRole("heading", { name: "Fallback edge", exact: true })).toBeVisible();
});
