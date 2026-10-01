import type { Page } from "@playwright/test";

import { expect, openGraph, save, test, waitForCanvasToSettle } from "../fixtures";

// canvas-workbench-ergonomics-plan.md, slice G: display-only edge styles,
// with a default pattern per kind.

const edgePath = (page: Page, source: string, target: string) =>
  page.getByRole("group", { name: `Edge from ${source} to ${target}` }).locator("path.react-flow__edge-path");
const dash = (page: Page, source: string, target: string) =>
  edgePath(page, source, target).evaluate((path) => getComputedStyle(path).strokeDasharray);
const width = (page: Page, source: string, target: string) =>
  edgePath(page, source, target).evaluate((path) => getComputedStyle(path).strokeWidth);

test("kinds have default patterns; the menu and inspector restyle an edge, and it saves", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E edge styles ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  // Always edges are solid; the router's Fallback edge is dotted.
  await expect.poll(() => dash(page, "llm_answer", "output_1")).toBe("none");
  const fallback = graph.edges.find((edge) => edge.kind === "default")!;
  await expect.poll(() => dash(page, fallback.source, fallback.target)).not.toBe("none");

  // Style ▸ Dashed from the right-click menu.
  await page.getByRole("group", { name: "Edge from llm_answer to output_1" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Style" }).hover();
  await page.getByRole("menu", { name: "Style" }).getByRole("menuitemcheckbox", { name: "Dashed" }).click();
  await expect.poll(() => dash(page, "llm_answer", "output_1")).not.toBe("none");
  await expect(page.getByRole("status").first()).toHaveText("Unsaved");

  // Thick from the inspector.
  await page.getByRole("group", { name: "Edge from llm_answer to output_1" }).click();
  await page.getByRole("radiogroup", { name: "Line weight" }).getByRole("radio", { name: "Thick" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 10, y: 300 } });
  await expect.poll(() => width(page, "llm_answer", "output_1")).toBe("3px");

  await save(page);
  const saved = await api.getGraph(graph.id);
  const edge = saved.edges.find((candidate) => candidate.source === "llm_answer" && candidate.target === "output_1");
  expect(edge?.extensions).toEqual({ style: { pattern: "dashed", weight: "thick" } });

  // It survives a reload.
  await page.reload();
  await expect.poll(() => width(page, "llm_answer", "output_1")).toBe("3px");
});
