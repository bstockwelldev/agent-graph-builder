import type { Page } from "@playwright/test";

import { expect, openGraph, save, test, waitForCanvasToSettle } from "../fixtures";

// Node configuration beyond the form fields (the raw JSON/YAML editor and
// the expanded template editor), architecture layers, and managing saved
// routing-lab datasets.
type SavedGraph = { layers?: { id: string; label: string }[]; nodes: { id: string; config: Record<string, unknown>; extensions?: { layer?: string } }[] };
const savedGraph = async (api: { getGraph: (id: string) => Promise<unknown> }, id: string) => (await api.getGraph(id)) as SavedGraph;
const openView = async (page: Page, view: string) => {
  await page.getByRole("button", { name: /^View:/ }).click();
  await page.getByRole("menuitemcheckbox", { name: view }).click();
};

test("edits a node's config as raw JSON and YAML", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E raw node config");
  await openGraph(page, graph, "?node=prompt_answer");
  const inspector = page.getByRole("region", { name: "Node details" });
  await inspector.getByRole("tab", { name: "Raw JSON" }).click();
  const raw = inspector.getByRole("textbox", { name: "Raw config (JSON)" });
  const apply = inspector.getByRole("button", { name: "Apply" });
  await expect(raw).toHaveValue(/"template": "Answer the user's question/);
  await expect(apply).toBeDisabled();

  // Invalid JSON is rejected on Apply and changes nothing; Reset restores the config.
  await raw.fill('{ "template": ');
  await apply.click();
  await expect(inspector.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("status").first()).toHaveText("Saved");
  await inspector.getByRole("button", { name: "Reset" }).click();
  await expect(inspector.getByRole("alert")).toHaveCount(0);
  await expect(raw).toHaveValue(/"template": "Answer the user's question/);

  await raw.fill(JSON.stringify({ template: "Reply in one line: {question}" }, null, 2));
  await apply.click();
  await expect(page.getByRole("status").first()).toHaveText("Unsaved");
  await inspector.getByRole("tab", { name: "Config" }).click();
  await expect(inspector.getByRole("textbox", { name: "Prompt template" })).toHaveValue("Reply in one line: {question}");

  // The same config reads as YAML, and edits there apply too.
  await inspector.getByRole("tab", { name: "Raw JSON" }).click();
  await inspector.getByRole("tab", { name: "YAML" }).click();
  const yaml = inspector.getByRole("textbox", { name: "Raw config (YAML)" });
  await expect(yaml).toHaveValue(/^template: "Reply in one line: \{question\}"/);
  await yaml.fill("template: 'Two lines max: {question}'\n");
  await inspector.getByRole("button", { name: "Apply" }).click();
  await save(page);
  const node = (await savedGraph(api, graph.id)).nodes.find((n) => n.id === "prompt_answer")!;
  expect(node.config.template).toBe("Two lines max: {question}");
});

test("the expanded template editor offers the graph's variables", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E template editor");
  await openGraph(page, graph, "?node=prompt_answer");
  const inspector = page.getByRole("region", { name: "Node details" });
  await inspector.getByRole("button", { name: "Expand editor" }).click();

  const dialog = page.getByRole("dialog", { name: "Prompt template" });
  await expect(dialog).toContainText("Available: {question}");
  const editor = dialog.getByRole("textbox", { name: "Prompt template" });
  await expect(editor).toBeFocused();
  await editor.fill("Summarize {q");
  // Typing `{` opens variable suggestions; Enter accepts the highlighted one.
  await expect(dialog.getByRole("listbox", { name: "Variables" }).getByRole("option", { name: /question/ })).toBeVisible();
  await editor.press("Enter");
  await expect(editor).toHaveValue(/^Summarize \{question\}/);
  await expect(dialog).toContainText(/\d+ chars/);

  // Escape closes only the editor; the edit is kept on the node.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("textbox", { name: "Prompt template" })).toHaveValue(/^Summarize \{question\}/);
});

test("sets up layers, auto-assigns nodes and filters the layers view", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E layers");
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);

  await page.getByRole("button", { name: /^View:/ }).click();
  await page.getByRole("menuitem", { name: "Manage layers…" }).click();
  const dialog = page.getByRole("dialog", { name: "Manage layers" });
  await expect(dialog.getByText("No layers yet.")).toBeVisible();
  await dialog.getByRole("button", { name: "Use default layers" }).click();
  await expect(dialog.getByRole("textbox", { name: /^Layer \d name$/ })).toHaveCount(4);
  await dialog.getByRole("textbox", { name: "Layer 3 name" }).fill("Lookups");
  await dialog.getByRole("radio", { name: "Assign unassigned nodes" }).check();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();

  // Each node type lands in its default lane; nothing is left unassigned.
  await openView(page, "Layers");
  const lane = (label: string) => page.getByRole("group", { name: `Layer ${label}` });
  for (const label of ["Ingress", "Reasoning", "Lookups", "Egress"]) await expect(lane(label)).toBeVisible();
  await expect(lane("Unassigned")).toHaveCount(0);
  const filters = page.getByRole("toolbar", { name: "Layer filters" });
  const lookups = filters.getByRole("button", { name: /^Lookups · \d+$/ });
  await expect(lookups).toHaveAttribute("aria-pressed", "true");
  await lookups.click();
  await expect(lookups).toHaveAttribute("aria-pressed", "false");
  await expect(lane("Lookups")).toHaveCount(0);
  await lookups.click();
  await expect(lane("Lookups")).toBeVisible();

  await openView(page, "Canvas");
  await save(page);
  const saved = await savedGraph(api, graph.id);
  expect(saved.layers?.map((layer) => layer.label)).toEqual(["Ingress", "Reasoning", "Lookups", "Egress"]);
  expect(saved.nodes.every((node) => node.extensions?.layer)).toBe(true);
});

test("routing lab datasets can be updated, reloaded and deleted", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E datasets");
  await openGraph(page, graph, "?panel=routingLab");
  const fixtures = page.getByRole("textbox", { name: "Dataset fixtures (JSON)" });
  const picker = page.getByRole("combobox", { name: "Saved dataset" });
  const name = `E2E dataset ${Date.now()}`;

  await page.getByRole("textbox", { name: "Dataset name" }).fill(name);
  await page.getByRole("button", { name: "Save as new" }).click();
  await expect(picker).toContainText(`${name} (2 fixtures)`);

  // Trim to one fixture and update the saved dataset in place.
  await fixtures.fill(JSON.stringify([{ input: { question: "what is an index" }, node_outputs: {} }]));
  await page.getByRole("button", { name: `Update “${name}”` }).click();
  await expect(picker).toContainText(`${name} (1 fixture`);

  // Loading it back replaces the edited fixtures.
  await fixtures.fill("[]");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(fixtures).toHaveValue(/what is an index/);

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: /^(Confirm delete|Delete)/ }).last().click();
  await expect(picker).not.toContainText(name);
});
