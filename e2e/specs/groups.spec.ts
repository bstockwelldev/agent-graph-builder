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

  // A new group opens with its name field focused; Ctrl+S commits the typed name and saves.
  const nameField = page.getByRole("textbox", { name: "Group name" });
  await expect(nameField).toBeFocused();
  await nameField.fill("Answer draft");
  await save(page);
  expect(await groupsOf()).toMatchObject([{ label: "Answer draft", node_ids: expect.arrayContaining(["prompt_answer", "llm_answer"]) }]);
  const frame = page.getByRole("group", { name: "Group Answer draft" });
  await expect(frame).toBeVisible();

  // A selected member's toolbar sits below the node, clear of the group header.
  await expect(node("llm_answer")).toHaveClass(/selected/);
  await expect(page.getByRole("toolbar", { name: /actions$/ }).first()).toBeVisible();

  // Collapse to a single card: members leave the canvas; expand brings them back.
  await page.getByRole("button", { name: "Collapse group Answer draft" }).click();
  await expect(page.getByRole("group", { name: "Group Answer draft (collapsed)" })).toBeVisible();
  await expect(node("prompt_answer")).toBeHidden();
  await page.getByRole("button", { name: "Expand group Answer draft" }).click();
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
