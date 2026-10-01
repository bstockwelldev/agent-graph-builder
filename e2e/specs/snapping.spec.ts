import type { Page } from "@playwright/test";

import {
  expect,
  openGraph,
  save,
  test,
  waitForCanvasToSettle,
} from "../fixtures";

// canvas-workbench-ergonomics-plan.md, slice F: smart guides while dragging,
// Align and Distribute, and the grid size in the status bar.

const node = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);
const box = async (page: Page, id: string) =>
  (await node(page, id).boundingBox())!;

/** Fits the view and waits for it, so the first load-time fit can't land mid-drag. */
async function fitAndSettle(page: Page) {
  await waitForCanvasToSettle(page);
  await page
    .getByRole("group", { name: "Canvas status" })
    .getByRole("button", { name: /^Zoom \d+%/ })
    .click();
  await waitForCanvasToSettle(page);
}

test("dragging a node near another's edge snaps to it and shows a guide", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E guides ${Date.now()}`);
  await openGraph(page, graph);
  await fitAndSettle(page);

  // Drag the tool card so its left edge lands 1px right of the prompt card above it.
  const target = await box(page, "prompt_answer");
  const moving = await box(page, "tool_lookup");
  const grab = { x: moving.x + moving.width / 2, y: moving.y + 8 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  // React Flow starts the drag on the first move; aim from where the card is then.
  await page.mouse.move(grab.x, grab.y + 20, { steps: 4 });
  const started = await box(page, "tool_lookup");
  await page.mouse.move(grab.x + (target.x - started.x) + 1, grab.y + 60, {
    steps: 12,
  });
  await expect(page.getByTestId("snap-guide").first()).toBeAttached();
  await page.mouse.up();
  await expect(page.getByTestId("snap-guide")).toHaveCount(0);

  await expect
    .poll(async () =>
      Math.abs(
        (await box(page, "tool_lookup")).x -
          (await box(page, "prompt_answer")).x,
      ),
    )
    .toBeLessThan(0.5);
});

test("Align and Distribute from the context menu and the keyboard", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E align ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await node(page, "prompt_answer").click();
  await node(page, "tool_lookup").click({ modifiers: ["ControlOrMeta"] });
  await node(page, "tool_lookup").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Align" }).hover();
  await page
    .getByRole("menu", { name: "Align" })
    .getByRole("menuitem", { name: /^Left/ })
    .click();
  await expect
    .poll(async () => {
      const a = await box(page, "prompt_answer");
      const b = await box(page, "tool_lookup");
      return Math.abs(a.x - b.x);
    })
    .toBeLessThan(0.5);

  // ⌥W aligns the tops; three nodes can be distributed with ⌥⇧V.
  await node(page, "llm_answer").click({ modifiers: ["ControlOrMeta"] });
  await page.keyboard.press("Alt+KeyW");
  await expect
    .poll(async () => {
      const tops = await Promise.all(
        ["prompt_answer", "tool_lookup", "llm_answer"].map(
          async (id) => (await box(page, id)).y,
        ),
      );
      return Math.max(...tops) - Math.min(...tops);
    })
    .toBeLessThan(0.5);
  await page.keyboard.press("Alt+Shift+KeyH");
  await expect
    .poll(async () => {
      const boxes = (
        await Promise.all(
          ["prompt_answer", "tool_lookup", "llm_answer"].map((id) =>
            box(page, id),
          ),
        )
      ).sort((a, b) => a.x - b.x);
      const gap1 = boxes[1].x - (boxes[0].x + boxes[0].width);
      const gap2 = boxes[2].x - (boxes[1].x + boxes[1].width);
      return Math.abs(gap1 - gap2);
    })
    .toBeLessThan(1);
});

test("the grid size is remembered and auto-arrange lands on it", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E grid ${Date.now()}`);
  await openGraph(page, graph);
  const gridSize = page
    .getByRole("group", { name: "Canvas status" })
    .getByRole("combobox", { name: "Grid size" });
  await expect(gridSize).toHaveValue("24");
  await gridSize.selectOption("48");

  await page
    .locator(".react-flow__pane")
    .click({ button: "right", position: { x: 40, y: 300 } });
  await page.getByRole("menuitem", { name: "Auto-arrange" }).click();
  await waitForCanvasToSettle(page);
  await save(page);
  const saved = await api.getGraph(graph.id);
  for (const saved_node of saved.nodes) {
    const position = saved_node.position as { x: number; y: number };
    expect([position.x % 48, position.y % 48].map(Math.abs)).toEqual([0, 0]);
  }

  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "Canvas status" })
      .getByRole("combobox", { name: "Grid size" }),
  ).toHaveValue("48");
});
