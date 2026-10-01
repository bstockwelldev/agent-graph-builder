import { expect, openGraph, test } from "../fixtures";

// canvas-workbench-ergonomics-plan.md, slice D: the console as a
// terminal-style dock at the bottom of the canvas, collapsed by default.

test("the console dock opens from the status bar and ⌘⇧J, filters, and focuses nodes", async ({
  page,
  api,
}) => {
  await page.setViewportSize({ width: 1180, height: 800 });
  const graph = await api.createDemoGraph(`E2E console dock ${Date.now()}`);
  await openGraph(page, graph, "?panel=run");
  const dock = page.getByRole("region", { name: "Console", exact: true });
  await expect(dock).toHaveCount(0);

  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page).toHaveURL(/[?&]run=run_/);
  const bar = page.getByRole("group", { name: "Canvas status" });
  const toggle = bar.getByRole("button", { name: /^Console:/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(dock).toBeVisible();
  const log = dock.getByRole("log", { name: "Console entries" });
  await expect(log).toContainText(/Run started on stub/);
  await expect(log).toContainText("Run succeeded");
  await expect(log).toContainText("node.completed");

  // The pane shrinks to make room; the dock sits above the status bar.
  const dockBox = (await dock.boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  const paneBox = (await page.locator(".react-flow__pane").boundingBox())!;
  expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(barBox.y + 1);
  expect(paneBox.y + paneBox.height).toBeLessThanOrEqual(dockBox.y + 1);

  // Filter to one node, then jump to it from its entry.
  await dock
    .getByRole("searchbox", { name: "Filter console" })
    .fill("llm_classify");
  await expect(log.locator("[data-severity]").first()).toContainText(
    "llm_classify",
  );
  await expect(log).not.toContainText("prompt_classify");
  await log.getByRole("button", { name: "llm_classify" }).first().click();
  await expect(
    page.locator('.react-flow__node[data-id="llm_classify"]'),
  ).toHaveClass(/selected/);

  // Errors only: a clean stub run has none.
  await dock.getByRole("searchbox", { name: "Filter console" }).fill("");
  await dock.getByRole("button", { name: /^Info \d+$/ }).click();
  await dock.getByRole("button", { name: /^Warnings \d+$/ }).click();
  await expect(log).toContainText("No entries match the filters.");

  // ⌘⇧J closes and reopens it; the floating console panel stays closed on desktop.
  await page
    .locator(".react-flow__pane")
    .click({ position: { x: 10, y: 200 } });
  await page.keyboard.press("ControlOrMeta+Shift+J");
  await expect(dock).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+J");
  await expect(dock).toBeVisible();
  await expect(page.getByRole("tab", { name: "Run events" })).toHaveCount(0);

  // The height is remembered.
  const handle = dock.getByRole("separator", { name: "Resize console" });
  await handle.focus();
  await page.keyboard.press("ArrowUp");
  const height = await handle.getAttribute("aria-valuenow");
  await page.keyboard.press("ControlOrMeta+Shift+J");
  await page.keyboard.press("ControlOrMeta+Shift+J");
  await expect(
    dock.getByRole("separator", { name: "Resize console" }),
  ).toHaveAttribute("aria-valuenow", height!);
});

test("saves and validation land in the console", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E console trail ${Date.now()}`);
  await openGraph(page, graph);
  await page.getByRole("textbox", { name: "Graph name" }).fill("Console trail");
  await page.keyboard.press("ControlOrMeta+s");
  await page.getByRole("button", { name: /^Validate graph/ }).click();
  await page
    .getByRole("group", { name: "Canvas status" })
    .getByRole("button", { name: /^Console:/ })
    .click();
  const log = page
    .getByRole("region", { name: "Console", exact: true })
    .getByRole("log");
  await expect(log).toContainText('Saved "Console trail"');
  await expect(log).toContainText("Validated:");
});
