import { API_URL, expect, openGraph, test } from "../fixtures";

// resource-forms-consistency-plan.md, slice 7: a Datasets page to browse,
// rename and delete saved Routing Lab datasets, with "Open in routing lab".

test("the Datasets page renames a dataset, opens it in the routing lab, and deletes it", async ({ page, api, request }) => {
  const stamp = Date.now();
  const graph = await api.createDemoGraph(`E2E datasets ${stamp}`);
  const id = `ds_e2e_${stamp}`;
  const name = `E2E dataset ${stamp}`;
  const fixtures = [
    { input: { question: `What is ${stamp}?` }, node_outputs: {} },
    { input: { question: "Second" }, node_outputs: { llm_classify: "billing" } },
  ];
  expect(
    (await request.post(`${API_URL}/api/datasets`, { data: { id, name, graph_id: graph.id, fixtures, created_at: "2026-01-01T00:00:00Z" } })).ok(),
  ).toBe(true);

  await page.goto("/datasets");
  const card = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Edit dataset ${name}` }) });
  await expect(card.getByText("2 fixtures")).toBeVisible();
  await expect(card.getByRole("list", { name: `${name} fixtures` })).toContainText("· 1 frozen output");

  // Rename: fixtures, provenance and creation time survive.
  await card.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit dataset" });
  await expect(dialog.getByRole("combobox", { name: "Graph" })).toContainText(graph.name);
  const fixturesField = dialog.getByLabel("Fixtures (JSON)");
  await fixturesField.fill("{}");
  await expect(dialog.getByText("To save: Fix the fixtures JSON.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
  await fixturesField.fill(JSON.stringify(fixtures));
  const renamed = `${name} renamed`;
  await dialog.getByLabel("Name").fill(renamed);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const saved = await (await request.get(`${API_URL}/api/datasets/${id}`)).json();
  expect(saved).toMatchObject({ name: renamed, graph_id: graph.id, fixtures, created_at: expect.stringMatching(/^2026-01-01T00:00:00/) });

  // Graph scope lists datasets captured from that graph.
  await page.goto(`/datasets?graph=${graph.id}`);
  await expect(page.getByRole("status").filter({ hasText: `used by ${graph.name}` })).toContainText(/^1 of \d+ datasets used by/);

  // "Open in routing lab" loads it into the graph's Routing Lab.
  await page.getByRole("link", { name: `Open ${renamed} in routing lab` }).click();
  await expect(page).toHaveURL(new RegExp(`/graphs/${graph.id}\\?panel=routingLab&dataset=${id}`));
  await expect(page.getByLabel("Dataset fixtures (JSON)")).toHaveValue(new RegExp(`What is ${stamp}\\?`));
  await expect(page.getByLabel("Saved dataset")).toHaveValue(id);
  await expect(page.getByRole("button", { name: `Update “${renamed}”` })).toBeVisible();

  // Delete from the page (back in the workspace scope).
  await page.goto(`/datasets?graph=${graph.id}`);
  await page.getByRole("button", { name: "Show all" }).click();
  await page.getByRole("button", { name: `Delete ${renamed}` }).click();
  await page.getByRole("dialog", { name: "Delete dataset" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: `Edit dataset ${renamed}` })).toHaveCount(0);
  expect((await request.get(`${API_URL}/api/datasets/${id}`)).status()).toBe(404);
});

test("a dataset saved from the routing lab records its graph", async ({ page, api, request }) => {
  const stamp = Date.now();
  const graph = await api.createDemoGraph(`E2E dataset provenance ${stamp}`);
  const name = `E2E lab dataset ${stamp}`;
  await openGraph(page, graph, "?panel=routingLab");
  await page.getByLabel("Dataset name").fill(name);
  await page.getByRole("button", { name: "Save as new" }).click();
  await expect(page.getByRole("button", { name: `Update “${name}”` })).toBeVisible();

  const datasets: { name: string; graph_id: string | null }[] = await (await request.get(`${API_URL}/api/datasets`)).json();
  expect(datasets.find((dataset) => dataset.name === name)?.graph_id).toBe(graph.id);
});
