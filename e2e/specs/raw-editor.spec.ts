import { expect, openGraph, test } from "../fixtures";

test("edits the graph through the YAML config editor and rejects an id change", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E raw editor");
  await openGraph(page, graph);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Graph config/ }).click();
  const editor = page.getByRole("textbox", { name: /Graph config/ });
  expect(JSON.parse(await editor.inputValue())).toMatchObject({ id: graph.id, name: "E2E raw editor" });

  await page.getByRole("tab", { name: /YAML/ }).click();
  const yaml = await editor.inputValue();
  expect(yaml).toMatch(/^name: E2E raw editor$/m);

  await editor.fill(yaml.replace(/^name: .*$/m, "name: Renamed in YAML"));
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("textbox", { name: "Graph name" })).toHaveValue("Renamed in YAML");
  await expect(page.getByRole("status").first()).toHaveText("Unsaved");

  // The id is fixed: changing it is refused with an explanation.
  const current = await editor.inputValue();
  await editor.fill(current.replace(/^id: .*$/m, "id: some_other_graph"));
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Graph name" })).toHaveValue("Renamed in YAML");

  await page.getByRole("button", { name: "Reset" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("status").first()).toHaveText("Saved");
  expect((await api.getGraph(graph.id)).name).toBe("Renamed in YAML");
});
