import type { Page } from "@playwright/test";

import {
  expect,
  openGraph,
  save,
  test,
  waitForCanvasToSettle,
} from "../fixtures";

// canvas-workbench-ergonomics-plan.md, slice C: the canvas right-click menus
// behave like native ones (submenus, typeahead, Home/End, Escape order, a
// right-click elsewhere moves the menu) and carry more actions per target.

const node = (page: Page, id: string) =>
  page.locator(`.react-flow__node[data-id="${id}"]`);
const counts = (page: Page) =>
  page
    .getByRole("group", { name: "Canvas status" })
    .getByText(/^\d+ nodes? · \d+ edges?$/);

async function rightClickPane(page: Page, x = 30) {
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await page.mouse.click(pane.x + x, pane.y + pane.height - 120, {
    button: "right",
  });
}

test("empty canvas: Add node submenu, keyboard navigation and Escape order", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E pane menu ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await rightClickPane(page);
  const menu = page.getByRole("menu", { name: "Canvas" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    menu.getByRole("menuitemcheckbox", { name: "Snap to grid" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  const addNode = menu.getByRole("menuitem", { name: "Add node" });
  await expect(addNode).toBeFocused();
  // Typeahead jumps to the next item starting with the typed letter.
  await page.keyboard.press("f");
  await expect(menu.getByRole("menuitem", { name: "Fit view" })).toBeFocused();

  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  const submenu = page.getByRole("menu", { name: "Add node" });
  await expect(submenu).toBeVisible();
  await expect(submenu.getByRole("menuitem").first()).toBeFocused();
  // Escape closes the submenu first, then the menu.
  await page.keyboard.press("Escape");
  await expect(submenu).toHaveCount(0);
  await expect(addNode).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await rightClickPane(page);
  await page.getByRole("menuitem", { name: "Add node" }).hover();
  await page
    .getByRole("menu", { name: "Add node" })
    .getByRole("menuitem", { name: "Transform node" })
    .click();
  await expect(counts(page)).toHaveText("9 nodes · 8 edges");
});

test("a right-click elsewhere moves the menu to the new target", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E menu retarget ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await rightClickPane(page);
  await expect(page.getByRole("menu", { name: "Canvas" })).toBeVisible();
  const box = (await node(page, "llm_classify").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
    button: "right",
  });
  await expect(page.getByRole("menu", { name: "Canvas" })).toHaveCount(0);
  await expect(page.getByRole("menu", { name: "Node" })).toBeVisible();
});

test("node menu: copy and paste, rename, and focus on this node", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E node menu ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await node(page, "llm_answer").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy" }).click();
  await rightClickPane(page);
  await page.getByRole("menuitem", { name: "Paste" }).click();
  await expect(counts(page)).toHaveText("9 nodes · 8 edges");
  await expect(page.locator(".react-flow__node-llm")).toHaveCount(3);

  await node(page, "tool_lookup").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const name = page.getByRole("textbox", { name: "Node name" });
  await expect(name).toBeFocused();
  await name.fill("Topic lookup");
  await expect(node(page, "tool_lookup")).toContainText("Topic lookup");

  await node(page, "llm_classify").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Focus on this node" }).click();
  await expect(
    page.getByRole("button", { name: /^Focus mode/ }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Focus mode" })).toBeVisible();
});

test("edge menu: change the kind and splice a node into the edge", async ({
  page,
  api,
}) => {
  const graph = await api.createDemoGraph(`E2E edge menu ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  const edge = page.getByRole("group", {
    name: "Edge from llm_answer to output_1",
  });

  await edge.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Kind" }).hover();
  const kinds = page.getByRole("menu", { name: "Kind" });
  await expect(
    kinds.getByRole("menuitemcheckbox", { name: "Always" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await edge.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert node" }).hover();
  await page
    .getByRole("menu", { name: "Insert node" })
    .getByRole("menuitem", { name: "Transform node" })
    .click();
  await expect(counts(page)).toHaveText("9 nodes · 9 edges");
  await expect(edge).toHaveCount(0);

  await save(page);
  const saved = await api.getGraph(graph.id);
  const spliced = saved.nodes.find(
    (candidate) => candidate.type === "transform",
  )!;
  expect(saved.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source: "llm_answer", target: spliced.id }),
      expect.objectContaining({ source: spliced.id, target: "output_1" }),
    ]),
  );
});

test("select all, copy and paste with the keyboard", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E clipboard keys ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await page
    .locator(".react-flow__pane")
    .click({ position: { x: 10, y: 300 } });
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(8);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(counts(page)).toHaveText("16 nodes · 16 edges");
  // The pasted copies are the new selection.
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(8);
});
