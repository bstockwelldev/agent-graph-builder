import { expect, openGraph, save, test, waitForCanvasToSettle } from "../fixtures";

type Group = { id: string; label: string; node_ids: string[]; collapsed?: boolean | null; color?: string | null };

test("groups nodes, collapses, renames, recolors and ungroups, saving each change", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E groups");
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  const node = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
  const groupsOf = async (): Promise<Group[]> => ((await api.getGraph(graph.id)) as unknown as { groups?: Group[] }).groups ?? [];

  // Select the answer branch (prompt + llm) and group it from the context menu.
  await node("prompt_answer").click();
  await node("llm_answer").click({ modifiers: ["ControlOrMeta"] });
  await node("llm_answer").click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Group selection \(2\)/ }).click();

  const frame = page.getByRole("group", { name: "Group Group 1" });
  await expect(frame).toBeVisible();
  // A new group opens with its name field focused; keep the default name.
  await expect(page.getByRole("textbox", { name: "Group name" })).toBeFocused();
  await page.getByRole("textbox", { name: "Group name" }).press("Enter");
  await expect(page.getByRole("status").first()).toHaveText("Unsaved");
  await save(page);
  expect(await groupsOf()).toMatchObject([{ label: "Group 1", node_ids: expect.arrayContaining(["prompt_answer", "llm_answer"]) }]);

  // Clear the selection so the member node's toolbar doesn't cover the group header.
  await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);

  // Collapse to a single card: members leave the canvas; expand brings them back.
  await page.getByRole("button", { name: "Collapse group Group 1" }).click();
  await expect(page.getByRole("group", { name: "Group Group 1 (collapsed)" })).toBeVisible();
  await expect(node("prompt_answer")).toBeHidden();
  await page.getByRole("button", { name: "Expand group Group 1" }).click();
  await expect(node("prompt_answer")).toBeVisible();

  // Rename and recolor from the group's context menu.
  await frame.click({ button: "right", position: { x: 40, y: 12 } });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const name = page.getByRole("textbox", { name: "Group name" });
  await name.fill("Answer path");
  await name.press("Enter");
  const renamed = page.getByRole("group", { name: "Group Answer path" });
  await expect(renamed).toBeVisible();

  await renamed.click({ button: "right", position: { x: 40, y: 12 } });
  await page.getByRole("menuitemcheckbox", { name: "Violet" }).click();
  await save(page);
  expect(await groupsOf()).toMatchObject([{ label: "Answer path", color: "violet" }]);

  // Ungroup; the nodes stay.
  await renamed.click({ button: "right", position: { x: 40, y: 12 } });
  await page.getByRole("menuitem", { name: /^Ungroup/ }).click();
  await expect(renamed).toBeHidden();
  await expect(node("prompt_answer")).toBeVisible();
  await save(page);
  expect(await groupsOf()).toEqual([]);
});
