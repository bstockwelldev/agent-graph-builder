import type { Page } from "@playwright/test";

import { expect, openGraph, save, test, waitForCanvasToSettle } from "../fixtures";

// Canvas actions in ⌘K, help on every panel, and sticky notes with comments.

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const box = async (page: Page, id: string) => (await node(page, id).boundingBox())!;

test("⌘K runs canvas actions: align the selection, and says why one can't run", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E palette ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/canvas action/).fill("align left");
  await expect(page.getByRole("option", { name: /Align left.*Select two or more nodes/ })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  await node(page, "prompt_answer").click();
  await node(page, "tool_lookup").click({ modifiers: ["ControlOrMeta"] });
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/canvas action/).fill("align left");
  await page.getByRole("option", { name: /Align left/ }).click();
  await expect.poll(async () => Math.abs((await box(page, "prompt_answer")).x - (await box(page, "tool_lookup")).x)).toBeLessThan(0.5);

  // Views too: ⌘K ▸ Code view.
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/canvas action/).fill("code view");
  await page.getByRole("option", { name: /^Code view/ }).click();
  await expect(page).toHaveURL(/mode=code/);
});

test("graph panels have a help button", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E panel help ${Date.now()}`);
  await openGraph(page, graph, "?panel=releases");
  await page.getByRole("button", { name: "Help: Releases" }).click();
  await expect(page.getByRole("dialog", { name: "Help" }).getByRole("heading", { name: "Releases", exact: true })).toBeVisible();
});

test("sticky notes: add, write, comment, resolve, and they save with the graph", async ({ page, api }) => {
  await page.addInitScript(() => window.localStorage.setItem("agb.notes.author", "Ada"));
  const graph = await api.createDemoGraph(`E2E notes ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  // Right-click a node ▸ Add note: pinned to it, text field focused.
  await node(page, "router_1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add note" }).click();
  const inspector = page.getByRole("region", { name: "Note details" }).or(page.getByLabel("Note details"));
  await expect(page.getByLabel("Note text")).toBeFocused();
  await page.keyboard.type("Why does the fallback go to the LLM?");
  await expect(page.getByRole("combobox", { name: "Pinned to node" })).toContainText(/router/i);

  const card = page.getByRole("group", { name: /^Note by Ada: Why does the fallback/ });
  await expect(card).toBeVisible();

  // Comment, then resolve.
  await page.getByLabel("Add a comment").fill("Because other questions need a free-form answer.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByRole("list", { name: "Comments" })).toContainText("Because other questions");
  await expect(card).toContainText("1 comment");
  await inspector.getByRole("button", { name: "Resolve" }).click();
  await expect(card).toContainText("Resolved");

  await save(page);
  const saved = await api.getGraph(graph.id);
  const notes = (saved as unknown as { notes: { text: string; author: string; node_id: string; resolved: boolean; replies: { text: string; author: string }[] }[] }).notes;
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ text: "Why does the fallback go to the LLM?", author: "Ada", node_id: "router_1", resolved: true });
  expect(notes[0].replies[0]).toMatchObject({ author: "Ada", text: "Because other questions need a free-form answer." });

  // Survives a reload; Delete removes it and undo brings it back.
  await page.reload();
  await expect(card).toBeVisible();
  await card.click();
  await page.keyboard.press("Delete");
  await expect(card).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card).toBeVisible();
});

test("a pinned note follows its node; the Notes panel lists, filters, opens and hides notes", async ({ page, api }) => {
  await page.addInitScript(() => window.localStorage.setItem("agb.notes.author", "Ada"));
  const graph = await api.createDemoGraph(`E2E notes panel ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await node(page, "router_1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add note" }).click();
  await page.keyboard.type("Pinned to the router");
  const card = page.getByRole("group", { name: /^Note by Ada: Pinned to the router/ });

  // Drag the router: the note keeps its offset.
  const noteBefore = (await card.boundingBox())!;
  const routerBox = await box(page, "router_1");
  await page.mouse.move(routerBox.x + routerBox.width / 2, routerBox.y + routerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(routerBox.x + routerBox.width / 2 + 30, routerBox.y + routerBox.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const after = (await card.boundingBox())!;
      const routerAfter = await box(page, "router_1");
      return [Math.round(after.x - routerAfter.x - (noteBefore.x - routerBox.x)), Math.round(after.y - routerAfter.y - (noteBefore.y - routerBox.y))];
    })
    .toEqual([0, 0]);
  // The status bar counts open notes and opens the panel.
  await page.getByRole("button", { name: "Notes: 1 open" }).click();
  const list = page.getByRole("list", { name: "Notes" });
  await expect(list.getByRole("button", { name: /Pinned to the router/ })).toBeVisible();
  await page.getByRole("radio", { name: /Resolved \(0\)/ }).click();
  await expect(page.getByText("No resolved notes.")).toBeVisible();
  await page.getByRole("radio", { name: /Open \(1\)/ }).click();

  // Hide notes on the canvas, then open one from the list: it shows again and is selected.
  await page.getByRole("switch", { name: "Show notes on canvas" }).click();
  await expect(card).toHaveCount(0);
  await list.getByRole("button", { name: /Pinned to the router/ }).click();
  await expect(card).toBeVisible();
  await expect(page.getByLabel("Note text")).toHaveValue("Pinned to the router");
});
