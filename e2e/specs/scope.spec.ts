import { API_URL, expect, runOnStub, test } from "../fixtures";

// resource-forms-consistency-plan.md, slice 4: one Scope picker (Workspace
// or a graph) on Analytics, Policies and the Resources pages, kept in
// `?graph=` and remembered across pages.

test("Analytics scopes to one graph's runs and nodes", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E scope analytics ${Date.now()}`);
  await runOnStub(page, graph);

  await page.goto(`/analytics?graph=${graph.id}`);
  await expect(page.getByRole("combobox", { name: "Scope" })).toContainText(graph.name);
  await expect(page.getByText("Runs (recent)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "By graph" })).toHaveCount(0);
  const node = page.getByRole("link", { name: "llm_classify", exact: true });
  await expect(node).toHaveAttribute("href", `/graphs/${graph.id}?node=llm_classify&tab=history`);

  // Back to the workspace, then into the graph again from its "By graph" row.
  await page.getByRole("combobox", { name: "Scope" }).click();
  await page.getByRole("option", { name: "Workspace" }).click();
  await expect(page).not.toHaveURL(/graph=/);
  await page.getByRole("button", { name: `Show analytics for ${graph.name}` }).click();
  await expect(page).toHaveURL(new RegExp(`graph=${graph.id}`));
  await expect(page.getByText("Runs (recent)")).toBeVisible();
});

test("Policies in graph scope edit that graph's overrides, not the workspace", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph(`E2E scope policies ${Date.now()}`);
  const workspaceBefore = await (await request.get(`${API_URL}/api/policies/workspace`)).json();

  await page.goto(`/policies?graph=${graph.id}`);
  const rule = page.getByTestId("policy-rule-POLICY_LLM_MODEL_NOT_PINNED");
  await expect(rule.getByRole("combobox")).toContainText(/^Inherit \(/);
  await rule.getByRole("combobox").click();
  await page.getByRole("option", { name: /^Block — Blocks runs/ }).click();
  await expect(rule.getByLabel("Set by: This graph")).toBeVisible();

  const overrides = await (await request.get(`${API_URL}/api/graphs/${graph.id}/policies`)).json();
  expect(overrides.rules.POLICY_LLM_MODEL_NOT_PINNED).toMatchObject({ enforcement: "block" });
  expect(await (await request.get(`${API_URL}/api/policies/workspace`)).json()).toEqual(workspaceBefore);
});

test("Resource pages list what the graph in scope uses, and remember the scope", async ({ page, api, request }) => {
  const stamp = Date.now();
  const promptId = `e2e_scoped_prompt_${stamp}`;
  expect((await request.post(`${API_URL}/api/prompts`, { data: { id: promptId, name: `Scoped ${stamp}`, body: "Answer: {question}" } })).ok()).toBe(true);
  const graph = await api.createDemoGraph(`E2E scope resources ${stamp}`);
  graph.nodes = graph.nodes.map((node) => (node.id === "prompt_answer" ? { ...node, config: { ...node.config, promptId } } : node));
  await api.updateGraph(graph);

  await page.goto("/prompts");
  await page.getByRole("combobox", { name: "Scope" }).click();
  await page.getByRole("option", { name: graph.name }).click();
  await expect(page.getByRole("status").filter({ hasText: `used by ${graph.name}` })).toContainText(/^1 of \d+ prompts used by/);
  await expect(page.getByRole("button", { name: new RegExp(`^Edit prompt Scoped ${stamp}`) })).toBeVisible();

  // Another resource page keeps the scope.
  await page.getByRole("navigation", { name: "Resource types" }).getByRole("link", { name: "Tools" }).click();
  await expect(page.getByText(`${graph.name} uses no tools.`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/tools\\?graph=${graph.id}`));
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.getByRole("combobox", { name: "Scope" })).toContainText("Workspace");
});
