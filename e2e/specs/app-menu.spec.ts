import { expect, openGraph, test, waitForCanvasToSettle } from "../fixtures";

// Canvas-first landing plan, §5 and §7 AC 6: with the rail gone, the graph
// header's ⋯ menu has an App group, so the graph picker, the resource
// registries, Analytics, workspace policies and the GenUI catalog stay one
// click away from the canvas.

test("the header's ⋯ menu opens the picker and every panel that used to be a page", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E app menu ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  const choose = async (...path: string[]) => {
    await page.getByRole("button", { name: "More actions" }).click();
    for (const label of path) await page.getByRole("menuitem", { name: label, exact: true }).click();
  };

  await choose("Workspace policies");
  await expect(page.getByRole("button", { name: "Close Workspace policies" })).toBeVisible();

  await choose("GenUI catalog");
  await expect(page.getByRole("button", { name: "Close GenUI catalog" })).toBeVisible();

  await choose("Analytics");
  await expect(page.getByRole("button", { name: "Close Analytics" })).toBeVisible();

  await choose("Resources", "Datasets");
  await expect(page.getByRole("button", { name: "Close Datasets" })).toBeVisible();

  // Its name carries the ⌘O shortcut hint, so it can't be matched exactly.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /^Open graph/ }).click();
  await expect(page.getByRole("dialog", { name: "Open graph" })).toBeVisible();
});
