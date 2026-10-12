import { API_URL, expect, openGraph, test } from "../fixtures";

test("runs the demo graph on the stub provider and streams node results", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph("E2E run");
  await openGraph(page, graph, "?panel=run");

  await page.getByRole("button", { name: "Run", exact: true }).click();

  // The run settles, is labeled as local/offline, and the answer is shown.
  await expect(page.getByText("Succeeded").first()).toBeVisible();
  await expect(page.getByText("Offline").first()).toBeVisible();
  await expect(page.getByText(/A database index is a data structure/).first()).toBeVisible();

  // Node-level events reached the canvas: the router's chosen branch and the output ran.
  for (const nodeId of ["tool_lookup", "output_1"]) {
    await expect(page.locator(`.react-flow__node[data-id="${nodeId}"]`)).toContainText(/succeeded/i);
  }

  // The run is persisted server-side and linked from the URL.
  await expect(page).toHaveURL(/[?&]run=run_/);
  const runId = new URL(page.url()).searchParams.get("run");
  const run = await (await request.get(`${API_URL}/api/runs/${runId}`)).json();
  expect(run.status).toBe("succeeded");
  expect(run.provider).toBe("stub");
});

test("a run's provider is an override: it is not written into the graph's nodes", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E run override");
  const llmConfigs = async () =>
    Object.fromEntries((await api.getGraph(graph.id)).nodes.filter((n) => n.type === "llm").map((n) => [n.id, n.config]));
  const before = await llmConfigs();
  expect(Object.keys(before).length).toBeGreaterThan(0);

  await openGraph(page, graph, "?panel=run");
  // Before any run the card already says what it would run on (the run chip defaults to Stub).
  await expect(page.locator('.react-flow__node[data-id="llm_classify"]')).toContainText("stub · default model");

  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText("Succeeded").first()).toBeVisible();

  // Previously the run wrote `provider: "stub"` into every LLM node and saved it.
  expect(await llmConfigs()).toEqual(before);
});
