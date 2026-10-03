import type { Page } from "@playwright/test";

import { connectNodes, expect, openGraph, save, test, waitForCanvasToSettle } from "../fixtures";

// Canvas polish: edge routing, the palette's line for new edges, one undo
// step per node drag, and touch long-press menus.

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const pathD = (page: Page, source: string, target: string) =>
  page
    .getByRole("group", { name: `Edge from ${source} to ${target}` })
    .locator("path.react-flow__edge-path")
    .getAttribute("d");

test("an edge routes curved, step or straight, and the palette sets the line for new edges", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E edge routing ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  await expect.poll(() => pathD(page, "llm_answer", "output_1")).toContain("C"); // a bezier curve

  await page.getByRole("group", { name: "Edge from llm_answer to output_1" }).click();
  const routing = page.getByRole("radiogroup", { name: "Line routing" });
  await routing.getByRole("radio", { name: "Step" }).click();
  await expect.poll(() => pathD(page, "llm_answer", "output_1")).not.toContain("C");
  await routing.getByRole("radio", { name: "Straight" }).click();
  await expect.poll(async () => ((await pathD(page, "llm_answer", "output_1")) ?? "").match(/[A-Za-z]/g)?.join("")).toBe("ML");
  await save(page);
  const saved = await api.getGraph(graph.id);
  expect(saved.edges.find((edge) => edge.source === "llm_answer" && edge.target === "output_1")?.extensions).toEqual({ style: { routing: "straight" } });

  // New edges take the palette's line.
  await page.getByRole("group", { name: "New edge routing" }).getByRole("button", { name: "Step" }).click();
  await page.getByRole("group", { name: "New edge pattern" }).getByRole("button", { name: "Dashed" }).click();
  await connectNodes(page, "input_1", "output_1");
  await expect(page.getByRole("group", { name: "Edge from input_1 to output_1" })).toBeVisible();
  await save(page);
  const withNew = await api.getGraph(graph.id);
  expect(withNew.edges.find((edge) => edge.source === "input_1" && edge.target === "output_1")?.extensions).toEqual({
    style: { routing: "step", pattern: "dashed" },
  });
});

test("dragging a node is one undo step", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E drag undo ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  const before = (await node(page, "router_1").boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 60, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await node(page, "router_1").boundingBox())!.x - before.x)).toBeGreaterThan(40);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => Math.round((await node(page, "router_1").boundingBox())!.x - before.x)).toBe(0);
  await expect.poll(async () => Math.round((await node(page, "router_1").boundingBox())!.y - before.y)).toBe(0);
});

test("a touch long-press opens the node menu", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E long press ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  const target = node(page, "router_1");
  const box = (await target.boundingBox())!;
  const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerType: "touch", pointerId: 7, isPrimary: true };
  await target.dispatchEvent("pointerdown", point);
  await expect(page.getByRole("menu", { name: "Node" })).toBeVisible();
  await target.dispatchEvent("pointerup", point);
  await expect(page.getByRole("menu", { name: "Node" })).toBeVisible();
});
