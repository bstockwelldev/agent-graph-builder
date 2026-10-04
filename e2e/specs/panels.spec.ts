import { API_URL, expect, openGraph, runOnStub, test, validationChip } from "../fixtures";

// Graph-editor panels past their empty state: analytics, routing lab,
// knowledge, policies, and a library resource's version history.

test("analytics summarizes the graph's runs per node", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E analytics ${Date.now()}`);
  await runOnStub(page, graph);
  await openGraph(page, graph, "?panel=analytics");

  await expect(page.getByText(`${graph.name} — recent runs, per node`)).toBeVisible();
  // Each stat is a card: the label, then its value.
  const stat = (label: string) => page.getByText(label, { exact: true }).locator("xpath=ancestor::*[.//p][1]//p");
  const runs = stat("Runs (recent)");
  await expect(runs).toHaveText("1");
  await expect(stat("Success rate")).toHaveText("100%");
  const rows = page.getByRole("table").getByRole("row");
  // Header plus the six nodes the "technical" branch ran.
  await expect(rows).toHaveCount(7);
  await expect(rows.filter({ hasText: "llm_classify · llm" })).toContainText("100%");
  await expect(rows.filter({ hasText: "llm_answer" })).toHaveCount(0);

  // A node name focuses it on the canvas.
  await rows.filter({ hasText: "tool_lookup · tool" }).getByRole("button", { name: "tool_lookup" }).click();
  await expect(page).toHaveURL(/[?&]node=tool_lookup/);

  // Workspace scope: totals across graphs, with a row per graph.
  const workspace = page.getByRole("group", { name: "Analytics scope" }).getByRole("button", { name: "Workspace" });
  await workspace.click();
  await expect(workspace).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => Number((await stat("Invocations").textContent())?.replace(/,/g, ""))).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole("row", { name: `${graph.name} 1 $0.00` })).toBeVisible();
});

test("routing lab runs a dataset, compares against a release, and saves the dataset", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph("E2E routing lab");
  expect((await request.post(`${API_URL}/api/graphs/${graph.id}/releases`, { data: {} })).ok()).toBe(true);
  await openGraph(page, graph, "?panel=routingLab");

  // The default fixtures ask one technical and one other question: one of each route.
  await page.getByRole("button", { name: "Run dataset" }).click();
  await expect(page.getByText(/2 fixtures · est\. \$0 \(stub provider\)/)).toBeVisible();
  await expect(page.getByText(/router_1\s*tool_lookup: 1\/2\s*prompt_answer: 1\/2/)).toBeVisible();

  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByText(/Release \(latest\) \(baseline\) → Draft \(candidate\)/)).toBeVisible();
  await expect(page.getByText(/tool_lookup: 1 → 1\s*prompt_answer: 1 → 1/)).toBeVisible();

  const name = `E2E dataset ${Date.now()}`;
  await page.getByRole("textbox", { name: "Dataset name" }).fill(name);
  await page.getByRole("button", { name: "Save as new" }).click();
  await expect(page.getByRole("combobox", { name: "Saved dataset" })).toContainText(`${name} (2 fixtures)`);
  await expect(page.getByRole("button", { name: `Update “${name}”` })).toBeVisible();
  const datasets: { name: string; fixtures: unknown[] }[] = await (await request.get(`${API_URL}/api/datasets`)).json();
  expect(datasets.find((dataset) => dataset.name === name)?.fixtures).toHaveLength(2);
});

test("knowledge uploads a document that runs then retrieve from", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E knowledge");
  await openGraph(page, graph, "?panel=knowledge");
  await expect(page.getByText("Uploads will embed with Supabase Edge Function · gte-small")).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload document" }).click();
  await (await chooser).setFiles({
    name: "indexes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Indexes\n\nA database index keeps keys sorted so lookups work in logarithmic time.\n"),
  });
  await expect(page.getByText(/1 document · 1 chunk$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove indexes.md" })).toBeVisible();

  // A run's llm nodes retrieve from it, and the usage section says so.
  await runOnStub(page, graph);
  await openGraph(page, graph, "?panel=knowledge");
  await expect(page.getByText(/indexes\.md\s*1 retrieval across 1 run/)).toBeVisible();
  await expect(page.getByText(/llm_classify ← indexes\.md \(0\.\d+\)/)).toBeVisible();

  // The lineage graph links the document to the run and its llm nodes; a node
  // box opens that run with the node's Run tab, which lists its sources.
  const lineage = page.getByRole("group", { name: "Lineage graph" });
  await expect(lineage.getByRole("img", { name: "Document indexes.md (version 1)" })).toBeVisible();
  await expect(lineage.getByRole("button", { name: /^Run run_\w+: open$/ })).toBeVisible();
  await lineage.getByRole("button", { name: /^Node llm_classify in run run_\w+: open$/ }).click();
  const sources = page.getByRole("list", { name: "Knowledge sources" });
  await expect(sources).toContainText("indexes.md");
  await expect(sources).toContainText("v1");

  await openGraph(page, graph, "?panel=knowledge");

  // Removing asks for confirmation first.
  await page.getByRole("button", { name: "Remove indexes.md" }).click();
  await page.getByRole("button", { name: "Confirm remove indexes.md" }).click();
  await expect(page.getByText("No documents yet. Upload one to give this graph a knowledge base.")).toBeVisible();
});

test("a graph policy override blocks the graph until it is waived", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph("E2E policies");
  await openGraph(page, graph, "?panel=policies");

  // The demo has two llm nodes; cap model nodes at 1 and make it blocking.
  await page.getByRole("combobox", { name: "Too many model nodes enforcement" }).click();
  await page.getByRole("option", { name: /^Block Blocks runs/ }).click();
  await page.getByRole("spinbutton", { name: "Maximum model nodes" }).fill("1");
  await page.getByRole("spinbutton", { name: "Maximum model nodes" }).press("Tab");
  await expect
    .poll(async () => (await (await request.get(`${API_URL}/api/graphs/${graph.id}/policies`)).json()).rules?.POLICY_TOO_MANY_MODEL_NODES)
    .toMatchObject({ enforcement: "block", params: { max_model_nodes: 1 } });
  await expect(validationChip(page)).toHaveAccessibleName(/error/);

  // Waive it from the Run panel's Issues tab; the exception then lists under Policies.
  await openGraph(page, graph, "?panel=run");
  await page.getByRole("tab", { name: /Issues/ }).click();
  const waive = page.getByRole("group", { name: "Waive POLICY_TOO_MANY_MODEL_NODES" });
  await waive.getByRole("button").first().click();
  await expect(waive).toBeHidden();
  await expect(validationChip(page)).not.toHaveAccessibleName(/error/);

  await openGraph(page, graph, "?panel=policies");
  await expect(page.getByRole("button", { name: "Exceptions (1)" })).toBeVisible();
  await expect(page.getByText("Whole graph ·").or(page.getByText(/Node \S+ ·/)).first()).toBeVisible();
});

test("publishes versions of a library prompt from its history tab", async ({ page, request }) => {
  const id = `e2e_prompt_${Date.now()}`;
  const name = `E2E prompt ${id}`;
  expect((await request.post(`${API_URL}/api/prompts`, { data: { id, name, body: "Answer: {question}" } })).ok()).toBe(true);
  await page.goto("/prompts");
  const openEditor = async () => {
    await page.getByRole("button", { name: new RegExp(`^Edit prompt ${name}`) }).click();
    const dialog = page.getByRole("dialog", { name: "Edit prompt" });
    await dialog.getByRole("tab", { name: "History" }).click();
    return dialog;
  };

  let dialog = await openEditor();
  await dialog.getByRole("button", { name: "Version history" }).click();
  await expect(dialog.getByText("No versions yet. Publish one to snapshot the current saved state.")).toBeVisible();
  await dialog.getByRole("button", { name: "Publish version" }).click();
  await expect(dialog.getByText("New version published.")).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  // Nothing changed since, so a second publish is a no-op.
  await dialog.getByRole("button", { name: "Publish version" }).click();
  await expect(dialog.getByText("Already up to date — no changes since the last version.")).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);

  // Edit and save, then publish again: a second version with a different fingerprint.
  await dialog.getByRole("tab", { name: "Overview" }).click();
  await dialog.getByRole("textbox", { name: "Body" }).fill("Answer briefly: {question}");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  dialog = await openEditor();
  await dialog.getByRole("button", { name: "Publish version" }).click();
  await expect(dialog.getByText("New version published.")).toBeVisible();
  await dialog.getByRole("button", { name: "Version history" }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  const fingerprints = await dialog.getByRole("listitem").locator("span.font-mono").allTextContents();
  expect(new Set(fingerprints).size).toBe(2);
});
