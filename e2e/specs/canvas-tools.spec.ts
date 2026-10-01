import type { Page } from "@playwright/test";

import {
  API_URL,
  expect,
  openGraph,
  save,
  test,
  waitForCanvasToSettle,
} from "../fixtures";

// canvas-workbench-ergonomics-plan.md, slice E: the tool bar (Select, Hand,
// Marquee, Connect, Zoom) and the registry-driven, searchable palette with
// drag-and-drop and an icon strip.

const node = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);
const tools = (page: Page) =>
  page.getByRole("toolbar", { name: "Canvas tools" });
const activeTool = (page: Page) => page.getByTestId("active-tool");
const viewport = (page: Page) =>
  page.locator(".react-flow__viewport").getAttribute("style");

test("tools: keys pick them, Marquee selects, Zoom zooms, Hand pans, Space is a temporary Hand", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E tools ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  await expect(
    tools(page).getByRole("button", { name: "Select tool" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(activeTool(page)).toHaveText("Select tool");

  // Marquee: a box over the left half selects the nodes it touches.
  await page.keyboard.press("m");
  await expect(
    tools(page).getByRole("button", { name: "Marquee tool" }),
  ).toHaveAttribute("aria-pressed", "true");
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  const input = (await node(page, "input_1").boundingBox())!;
  const classify = (await node(page, "llm_classify").boundingBox())!;
  // From the empty space below the row, up and right across three cards.
  await page.mouse.move(input.x + input.width / 2, input.y + input.height + 40);
  await page.mouse.down();
  await page.mouse.move(classify.x + classify.width / 2, classify.y - 10, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(() => page.locator(".react-flow__node.selected").count())
    .toBeGreaterThanOrEqual(3);

  // Zoom: click zooms in around the pointer; Alt-click zooms back out.
  await page.keyboard.press("z");
  const zoomButton = page
    .getByRole("group", { name: "Canvas status" })
    .getByRole("button", { name: /^Zoom \d+%/ });
  const zoomOf = async () =>
    Number((await zoomButton.getAttribute("aria-label"))!.match(/\d+/)![0]);
  const before = await zoomOf();
  await page.mouse.click(pane.x + pane.width / 2, pane.y + pane.height - 60);
  await expect.poll(zoomOf).toBeGreaterThan(before);
  await waitForCanvasToSettle(page);
  const zoomedIn = await zoomOf();
  await page.keyboard.down("Alt");
  await page.mouse.click(pane.x + pane.width / 2, pane.y + pane.height - 60);
  await page.keyboard.up("Alt");
  await expect.poll(zoomOf).toBeLessThan(zoomedIn);

  // Hand: dragging across a node pans instead of moving it.
  await page.keyboard.press("h");
  await waitForCanvasToSettle(page);
  const start = await viewport(page);
  const nodeBefore = await node(page, "router_1").getAttribute("style");
  const router = (await node(page, "router_1").boundingBox())!;
  await page.mouse.move(
    router.x + router.width / 2,
    router.y + router.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    router.x + router.width / 2 + 120,
    router.y + router.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect.poll(() => viewport(page)).not.toBe(start);
  expect(await node(page, "router_1").getAttribute("style")).toBe(nodeBefore);

  // Space held: a temporary Hand, then back to the chosen tool.
  await page.keyboard.press("v");
  await page.keyboard.down("Space");
  await expect(activeTool(page)).toHaveText("Hand tool");
  await page.keyboard.up("Space");
  await expect(activeTool(page)).toHaveText("Select tool");
});

test("Connect tool: click a source then a target; the edge uses the palette's new-edge kind", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E connect tool ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await page.getByRole("button", { name: "Add node" }).click();
  await page
    .getByRole("group", { name: "New edges" })
    .getByRole("button", { name: "Fallback" })
    .click();
  await page.getByRole("button", { name: "Add node" }).click();

  await tools(page).getByRole("button", { name: "Connect tool" }).click();
  await node(page, "input_1").click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Connect: click a target for input_1" }),
  ).toBeVisible();
  // Escape drops the half-made connection.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("status").filter({ hasText: "Connect: click a target" }),
  ).toHaveCount(0);

  await node(page, "input_1").click();
  await node(page, "output_1").click();
  await expect(
    page.getByRole("group", { name: "Edge from input_1 to output_1" }),
  ).toHaveCount(1);
  await save(page);
  const saved = await api.getGraph(graph.id);
  expect(saved.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "input_1",
        target: "output_1",
        kind: "default",
      }),
    ]),
  );
});

test("palette: search, drag a node onto the canvas, add a bound library prompt, fold to icons", async ({
  page,
  api,
  request,
}) => {
  const stamp = Date.now();
  const promptId = `palette_${stamp}`;
  expect(
    (
      await request.post(`${API_URL}/api/prompts`, {
        data: {
          id: promptId,
          name: `Palette prompt ${stamp}`,
          body: "Q: {question}",
        },
      })
    ).ok(),
  ).toBe(true);
  const graph = await api.createDemoGraph(`E2E palette ${stamp}`);
  await openGraph(page, graph, "?panel=palette");
  await waitForCanvasToSettle(page);
  const palette = page.getByRole("searchbox", { name: "Search the palette" });

  await palette.fill("reshape");
  const nodes = page.getByRole("region", { name: "Nodes" });
  await expect(nodes.getByRole("button", { name: /^Transform/ })).toHaveCount(
    1,
  );
  await expect(nodes).not.toContainText("LLM");
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await nodes
    .getByRole("button", { name: /^Transform/ })
    .dragTo(page.locator(".react-flow__pane"), {
      targetPosition: { x: pane.width / 2, y: pane.height - 120 },
    });
  await expect(page.locator(".react-flow__node-transform")).toHaveCount(1);

  // A library prompt adds a prompt node already bound to it.
  await palette.fill(`Palette prompt ${stamp}`);
  await page
    .getByRole("region", { name: "Library" })
    .getByRole("button", { name: new RegExp(`^Palette prompt ${stamp}`) })
    .click();
  await expect(page.locator(".react-flow__node-prompt")).toHaveCount(3);
  await save(page);
  const saved = await api.getGraph(graph.id);
  expect(
    saved.nodes.some(
      (candidate) =>
        candidate.type === "prompt" && candidate.config?.promptId === promptId,
    ),
  ).toBe(true);

  // Fold to the icon strip; it remembers.
  await page.getByRole("button", { name: "Collapse palette" }).click();
  const strip = page.getByRole("group", { name: "Node palette (collapsed)" });
  await expect(
    strip.getByRole("button", { name: "Add Transform node" }),
  ).toBeVisible();
  await openGraph(page, { ...graph, nodes: saved.nodes }, "?panel=palette");
  await expect(
    page.getByRole("group", { name: "Node palette (collapsed)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand palette" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search the palette" }),
  ).toBeVisible();
});
