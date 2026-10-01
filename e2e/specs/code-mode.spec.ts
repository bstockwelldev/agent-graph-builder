import type { Page } from "@playwright/test";

import { expect, openGraph, test } from "../fixtures";

// canvas-workbench-ergonomics-plan.md, slice H: Code mode -- the graph as
// JSON/YAML in CodeMirror, problems on lines, ⌘S reviews then saves.

const editor = (page: Page) => page.getByRole("textbox", { name: "Graph code (JSON)" });

// CodeMirror renders only the lines in view: go to the top before reading the header lines.
async function scrollToTop(page: Page, name = "Graph code (JSON)") {
  await page.getByRole("textbox", { name }).click();
  await page.keyboard.press("ControlOrMeta+Home");
}

async function replaceCode(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

test("edits the graph as code: problems on lines, a reviewed save, and split view", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E code mode ${Date.now()}`);
  await page.addInitScript(() => window.localStorage.setItem("agb.rawEditor.syntax", "json"));
  await openGraph(page, graph, "?mode=code");
  await expect(editor(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Code view" })).toHaveAttribute("aria-pressed", "true");

  // A bad edge kind: Save refuses, the problem names its line, and the gutter marks it.
  const saved = await api.getGraph(graph.id);
  const bad = JSON.stringify({ ...saved, edges: saved.edges.map((edge, index) => (index === 0 ? { ...edge, kind: "sometimes" } : edge)) }, null, 2);
  await replaceCode(page, bad);
  await page.keyboard.press("ControlOrMeta+s");
  const problems = page.getByRole("list", { name: "Problems" });
  const badLine = bad.split("\n").findIndex((line) => line.includes('"sometimes"')) + 1;
  await expect(problems.getByRole("button", { name: new RegExp(`edges\\.0\\.kind.*Line ${badLine}`) })).toBeVisible();
  await expect(page.locator(".cm-lint-marker-error")).toHaveCount(1);
  await problems.getByRole("button", { name: /edges\.0\.kind/ }).click();
  await expect(page.locator(".cm-activeLine")).toContainText('"sometimes"');

  // A valid rename: ⌘S shows the change against the saved version, then saves.
  const renamed = `${graph.name} (code)`;
  await replaceCode(page, JSON.stringify({ ...saved, name: renamed }, null, 2));
  await page.keyboard.press("ControlOrMeta+s");
  const review = page.getByRole("region", { name: "Review changes" });
  await expect(review).toContainText("1 added · 1 removed");
  await expect(review.getByLabel("Changes")).toContainText(renamed);
  await review.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved");
  await expect.poll(async () => (await api.getGraph(graph.id)).name).toBe(renamed);
  await expect(page.getByLabel("Graph name")).toHaveValue(renamed);

  // Split: canvas and code side by side; a canvas edit refreshes the untouched draft.
  await page.getByRole("button", { name: "Split view" }).click();
  await expect(page).toHaveURL(/mode=split/);
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await expect(editor(page)).toBeVisible();
  await page.getByLabel("Graph name").fill("Split rename");
  await scrollToTop(page);
  await expect(editor(page)).toContainText('"name": "Split rename"');

  // YAML is a view of the same graph.
  await page.getByRole("tab", { name: "YAML" }).click();
  await scrollToTop(page, "Graph code (YAML)");
  await expect(page.getByRole("textbox", { name: "Graph code (YAML)" })).toContainText("name: Split rename");

  await page.getByRole("button", { name: "Canvas view" }).click();
  await expect(page).not.toHaveURL(/mode=/);
  await expect(page.getByRole("region", { name: "Graph code" })).toHaveCount(0);
});
