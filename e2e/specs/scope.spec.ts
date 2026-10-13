import { API_URL, expect, pickOption, runOnStub, test } from "../fixtures";

// resource-forms-consistency-plan.md, slice 4: one Scope picker (Workspace
// or a graph) on Policies and the resource panels, kept in `?graph=` and
// remembered across panels. Analytics scopes through its own toggle and
// `?scope=`. (These were pages until the canvas-first landing plan, Phase 3;
// the old URLs redirect here.)

test("Analytics scopes to one graph's runs and nodes", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E scope analytics ${Date.now()}`);
  await runOnStub(page, graph);

  // The old graph-scoped link opens that graph's own analytics.
  await page.goto(`/analytics?graph=${graph.id}`);
  await expect(page).toHaveURL(new RegExp(`/graphs/${graph.id}\\?`));
  const scope = page.getByRole("radiogroup", { name: "Analytics scope" });
  await expect(scope.getByRole("radio", { name: "This graph" })).toBeChecked();
  await expect(page.getByText("Runs (recent)")).toBeVisible();
  await expect(page.getByText("By graph", { exact: true })).toHaveCount(0);
  // Slice 5: charts over the graph's runs.
  await expect(page.getByRole("img", { name: /^Runs per day, by status: bar chart of succeeded/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Run duration \(runs\): bar chart/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Model calls: bar chart/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /^stub\// }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /^P95 latency by node \(ms\): bar chart/ })).toBeVisible();
  // A node row focuses that node on the canvas.
  await page.getByRole("button", { name: "llm_classify", exact: true }).click();
  await expect(page).toHaveURL(/[?&]node=llm_classify/);

  // Workspace scope lists every graph; its row opens that graph's analytics.
  await scope.getByRole("radio", { name: "Workspace" }).click();
  await expect(page.getByText("By graph", { exact: true })).toBeVisible();
  // In the By graph table; the header's switcher button carries the same name.
  await page.getByRole("row", { name: new RegExp(graph.name) }).getByRole("button", { name: graph.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/graphs/${graph.id}`));
  await expect(page.getByText("Runs (recent)")).toBeVisible();
});

test("Policies in graph scope edit that graph's overrides, not the workspace", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph(`E2E scope policies ${Date.now()}`);
  const workspaceBefore = await (await request.get(`${API_URL}/api/policies/workspace`)).json();

  await page.goto(`/policies?graph=${graph.id}`);
  const rule = page.getByTestId("policy-rule-POLICY_LLM_MODEL_NOT_PINNED");
  await expect(rule.getByRole("combobox")).toContainText(/^Inherit \(/);
  await pickOption(page, "LLM model not pinned enforcement", /^Block Blocks runs/);
  await expect(rule.getByLabel("Set by: This graph")).toBeVisible();

  const overrides = await (await request.get(`${API_URL}/api/graphs/${graph.id}/policies`)).json();
  expect(overrides.rules.POLICY_LLM_MODEL_NOT_PINNED).toMatchObject({ enforcement: "block" });
  expect(await (await request.get(`${API_URL}/api/policies/workspace`)).json()).toEqual(workspaceBefore);
});

test("Resource panels list what the graph in scope uses, and remember the scope", async ({ page, api, request }) => {
  const stamp = Date.now();
  const promptId = `e2e_scoped_prompt_${stamp}`;
  expect((await request.post(`${API_URL}/api/prompts`, { data: { id: promptId, name: `Scoped ${stamp}`, body: "Answer: {question}" } })).ok()).toBe(true);
  const graph = await api.createDemoGraph(`E2E scope resources ${stamp}`);
  graph.nodes = graph.nodes.map((node) => (node.id === "prompt_answer" ? { ...node, config: { ...node.config, promptId } } : node));
  await api.updateGraph(graph);

  await page.goto("/prompts");
  await pickOption(page, "Scope", new RegExp(graph.name));
  await expect(page.getByRole("status").filter({ hasText: `used by ${graph.name}` })).toContainText(/^1 of \d+ prompts used by/);
  await expect(page.getByRole("button", { name: `Edit Scoped ${stamp}`, exact: true })).toBeVisible();

  // Another kind keeps the scope.
  await pickOption(page, "Resource kind", /^Tools$/);
  // The Prompts panel animates out; two panels would match "Show all" until it is gone.
  await expect(page.getByRole("button", { name: "Close Prompts" })).toHaveCount(0);
  await expect(page.getByText(`${graph.name} uses no tools.`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`graph=${graph.id}`));
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.getByRole("combobox", { name: "Scope" })).toContainText("Workspace");
});
