import { API_URL, expect, openGraph, test } from "../fixtures";

// Run panel beyond a single run: the per-node views, history, replay,
// counterfactual replay, snapshots, capture as a dataset, and fixtures.
const STUB_ANSWER = /A database index is a data structure/;

test("inspects a run's waterfall and node trace, then replays it from history", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E run history");
  await openGraph(page, graph, "?panel=run");
  const panel = page.getByRole("region", { name: "Run console" });
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel.getByRole("tabpanel", { name: "Status" })).toContainText(STUB_ANSWER);

  // Waterfall lists each executed node; picking one opens its trace.
  await panel.getByRole("tab", { name: "Waterfall" }).click();
  const waterfall = panel.getByRole("tabpanel", { name: "Waterfall" });
  await expect(waterfall).toContainText(/Total elapsed: \d+ms/);
  for (const nodeId of ["input_1", "llm_classify", "router_1", "tool_lookup", "output_1"]) {
    await expect(waterfall.getByRole("button", { name: new RegExp(`^${nodeId} · `) })).toBeVisible();
  }
  await expect(waterfall.getByRole("button", { name: /^llm_answer · / })).toHaveCount(0);
  await waterfall.getByRole("button", { name: /^tool_lookup · / }).click();
  const trace = panel.getByRole("tabpanel", { name: "Trace" });
  await expect(trace.getByRole("heading", { name: "Input" })).toBeVisible();
  await expect(trace).toContainText('"toolName": "lookup_topic"');
  await expect(trace.getByRole("heading", { name: "Output" })).toBeVisible();
  await expect(trace).toContainText(STUB_ANSWER);
  await expect(page).toHaveURL(/[?&]node=tool_lookup/);

  // History: a second run joins the list; replay is read-only and re-derives every node.
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel.getByRole("tab", { name: /History/ })).toContainText("2");
  await panel.getByRole("tab", { name: /History/ }).click();
  const history = panel.getByRole("tabpanel", { name: "History" });
  await expect(history.getByRole("checkbox", { name: /^Select run run_/ })).toHaveCount(2);
  await history.getByRole("button", { name: "Replay", exact: true }).first().click();
  await expect(history.getByRole("heading", { name: "Replay (read-only)" })).toBeVisible();
  await expect(history).toContainText(/router_1: \{"classification":"technical","selectedTargetNodeId":"tool_lookup"/);

  // Snapshot: the graph as it was when the run started.
  await history.getByRole("button", { name: "View snapshot" }).first().click();
  await expect(history).toContainText(/fingerprint: [0-9a-f]{64}/);
  await expect(history).toContainText("8 nodes · 8 edges");
  await history.getByRole("button", { name: "Hide snapshot" }).click();
  await expect(history.getByText(/fingerprint: [0-9a-f]{64}/)).toHaveCount(0);
});

test("counterfactual replay forces the other route and shows what changed", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E counterfactual");
  await openGraph(page, graph, "?panel=run");
  const panel = page.getByRole("region", { name: "Run console" });
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel.getByRole("tabpanel", { name: "Status" })).toContainText(STUB_ANSWER);

  await panel.getByRole("tab", { name: /History/ }).click();
  const history = panel.getByRole("tabpanel", { name: "History" });
  await history.getByRole("button", { name: "Replay with changes…" }).click();
  const form = history.getByRole("group", { name: "Replay with changes" });
  const submit = form.getByRole("button", { name: "Replay with changes", exact: true });
  await expect(submit).toBeDisabled();
  await form.getByRole("combobox", { name: "Route at router_1" }).click();
  await page.getByRole("option", { name: "Force → prompt_answer" }).click();
  await expect(submit).toBeEnabled();
  await submit.click();

  const result = history.getByRole("group", { name: "Counterfactual result" });
  await expect(result).toContainText(/\d+ nodes changed/);
  await expect(result).toContainText("Forced route");
  await expect(result).toContainText("Newly reached");
  await expect(result).toContainText("Not reached");
  await expect(result).toContainText("[stub answer]");
});

test("captures selected runs as a dataset", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph("E2E capture");
  await openGraph(page, graph, "?panel=run");
  const panel = page.getByRole("region", { name: "Run console" });
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel.getByRole("tabpanel", { name: "Status" })).toContainText(STUB_ANSWER);

  await panel.getByRole("tab", { name: /History/ }).click();
  const history = panel.getByRole("tabpanel", { name: "History" });
  await expect(history.getByRole("button", { name: "Select runs to save as dataset" })).toBeDisabled();
  await history.getByRole("checkbox", { name: "Select all runs" }).check();
  await history.getByRole("button", { name: "Save 1 as dataset" }).click();

  const dialog = page.getByRole("dialog", { name: "Save runs as dataset" });
  const name = `E2E capture ${Date.now()}`;
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await expect(dialog).toContainText("The selected run becomes a fixture");
  await dialog.getByRole("button", { name: "Save dataset" }).click();
  await expect(dialog.getByRole("status")).toContainText(`Saved ${name} with 1 fixture.`);
  await expect(dialog.getByRole("link", { name: "Open graph" })).toHaveAttribute("href", `/graphs/${graph.id}`);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  const datasets: { name: string; fixtures: unknown[] }[] = await (await request.get(`${API_URL}/api/datasets`)).json();
  expect(datasets.find((dataset) => dataset.name === name)?.fixtures).toHaveLength(1);
});

test("simulates with a fixture that stubs a node's output", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E fixture");
  await openGraph(page, graph, "?panel=run");
  const panel = page.getByRole("region", { name: "Run console" });
  await panel.getByRole("button", { name: "More run options" }).click();
  await page.getByRole("menuitem", { name: "Run with fixture…" }).click();
  await expect(panel.getByRole("heading", { name: "Run with fixture" })).toBeVisible();

  // Stubbing the classifier's output sends the router down the other branch.
  await panel.getByLabel("Node output overrides (JSON: node id → mocked value)").fill('{"llm_classify": "other"}');
  await panel.getByRole("button", { name: "Simulate" }).click();
  await expect(panel.getByText('llm_classify: "other"')).toBeVisible();
  await expect(panel.getByText(/^router_1: .*"selectedTargetNodeId":"prompt_answer"/)).toBeVisible();
  await expect(panel.getByText(/^output_1: "\[stub answer\]/)).toBeVisible();
  await expect(panel.getByText(/^tool_lookup: /)).toHaveCount(0);

  await panel.getByRole("button", { name: "Close fixture simulation" }).click();
  await expect(panel.getByRole("heading", { name: "Run with fixture" })).toBeHidden();
});
