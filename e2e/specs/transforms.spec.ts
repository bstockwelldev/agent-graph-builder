import { API_URL, expect, openGraph, pickOption, runOnStub, save, test } from "../fixtures";

test("previews an edge transform with Try it", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E try it");
  await openGraph(page, graph, "?edge=e_tool_output");
  await page.getByRole("button", { name: /Add transform/ }).click();
  await page.getByRole("radio", { name: "Wrap" }).click();
  await page.getByLabel(/^Field/).fill("fact");

  await page.getByRole("button", { name: /Try it/ }).click();
  await page.getByLabel("Sample input").fill('"indexes speed up lookups"');
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByLabel("Preview output")).toHaveText(/"fact": "indexes speed up lookups"/);
});

test("creates a library transform, binds it to an edge and runs it", async ({ page, api, request }) => {
  const name = `Topic line ${Date.now()}`;
  await page.goto("/transforms");
  await page.getByRole("button", { name: /New transform/i }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel(/Message template/).fill("Topic line: {value}");
  await page.getByRole("button", { name: /^(Save|Create)/ }).last().click();
  await expect(page.getByText(name).first()).toBeVisible();
  const library: { id: string; name: string }[] = await (await request.get(`${API_URL}/api/transforms`)).json();
  const created = library.find((t) => t.name === name)!;
  expect(created).toBeTruthy();

  const graph = await api.createDemoGraph("E2E transform library");
  await openGraph(page, graph, "?edge=e_tool_output");
  await page.getByRole("button", { name: /Add transform/ }).click();
  await page.getByRole("radio", { name: /Library/ }).click();
  await pickOption(page, /library transform/, new RegExp(name));
  await save(page);
  expect((await api.getGraph(graph.id)).edges.find((e) => e.id === "e_tool_output")?.transform).toMatchObject({ transform_id: created.id });

  const run = await api.getRun(await runOnStub(page, graph));
  expect(run.status).toBe("succeeded");
  expect(JSON.stringify(run.result)).toContain("Topic line:");

  const usages: { graph_id: string }[] = await (await request.get(`${API_URL}/api/transforms/${created.id}/usages`)).json();
  expect(usages.map((u) => u.graph_id)).toContain(graph.id);
});

test("a transform node spliced between two steps reshapes the value at run time", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E transform node");
  graph.nodes.push({ id: "shape_1", type: "transform", position: { x: 2040, y: 300 }, config: { type: "wrap", field: "fact" } });
  graph.edges = graph.edges.map((edge) => (edge.id === "e_tool_output" ? { ...edge, target: "shape_1" } : edge));
  graph.edges.push({ id: "e_shape_output", source: "shape_1", target: "output_1", kind: "sequence" });
  await api.updateGraph(graph);

  await openGraph(page, graph, "?node=shape_1");
  await expect(page.locator('.react-flow__node[data-id="shape_1"]')).toContainText(/wrap/i);
  await expect(page.getByRole("radiogroup", { name: "Transform type" }).getByRole("radio", { name: "Wrap" })).toBeChecked();

  const run = await api.getRun(await runOnStub(page, graph));
  expect(run.status).toBe("succeeded");
  expect(JSON.stringify(run.result)).toContain('"fact"');
});
