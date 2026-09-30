import { API_URL, expect, openGraph, save, test, type GraphJson } from "../fixtures";

// resource-forms-consistency-plan.md, slice 5 part 2: the component library,
// the human_gate surface editor, and the backend's surface validation.

test("the GenUI library has a card per component, with a preview, props and Copy JSON", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/genui");
  const chart = page.getByRole("region", { name: "Chart" }).or(page.locator("#genui-chart"));
  await expect(chart.getByRole("img", { name: /^Weekly revenue and churn: line chart/ })).toBeVisible();
  await expect(chart.getByRole("table", { name: "Chart props" })).toContainText("data");
  await chart.getByRole("button", { name: "Copy Chart JSON" }).click();
  await expect(chart.getByRole("button", { name: "Copy Chart JSON" })).toContainText("Copied");
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.root).toMatchObject({ type: "Chart", props: { x: "week" } });
  await expect(page.locator("#genui-diagram").getByRole("img", { name: /Draft to Approved\?/ })).toBeVisible();
});

test("the surface editor validates, inserts examples and previews them; the API refuses a bad surface", async ({ page, api, request }) => {
  const base = await api.createDemoGraph(`E2E genui editor ${Date.now()}`);
  const graph: GraphJson = {
    ...base,
    nodes: [...base.nodes, { id: "gate_1", type: "human_gate", position: { x: 900, y: 0 }, config: { content: "Review" } }],
    edges: [
      ...base.edges.filter((edge) => !(edge.source === "tool_lookup" && edge.target === "output_1")),
      { id: "e_lookup_gate", source: "tool_lookup", target: "gate_1" },
      { id: "e_gate_output", source: "gate_1", target: "output_1" },
    ],
  };
  await api.updateGraph(graph);
  await openGraph(page, graph, "?node=gate_1");

  const editor = page.getByLabel("GenUI surface (JSON)");
  await editor.fill('{"root": {"type": "Select", "id": "s", "props": {"label": "S", "options": []}}}');
  await expect(page.getByRole("alert").filter({ hasText: "root.props.options" })).toBeVisible();

  await editor.fill("");
  await page.getByLabel("Insert example").selectOption("Approval");
  await page.getByLabel("Insert example").selectOption("Checkbox");
  const surface = JSON.parse(await editor.inputValue());
  expect(surface.root).toMatchObject({ type: "Stack", children: [{ type: "Approval" }, { type: "Checkbox" }] });
  const preview = page.getByRole("group", { name: "Ship the pricing change?" });
  await expect(preview.getByRole("button", { name: "Ship to 10%" })).toBeDisabled();
  await expect(preview).toContainText("/nodes/llm_answer/output");
  await save(page);
  const saved = (await api.getGraph(graph.id)).nodes.find((node) => node.id === "gate_1")!;
  expect(JSON.parse(String(saved.config?.genuiCheckpointSurfaceJson)).root.children).toHaveLength(2);

  // The backend checks the shape too: a bad surface is a node config diagnostic.
  const bad = { ...graph, nodes: graph.nodes.map((node) => (node.id === "gate_1" ? { ...node, config: { content: "Review", genuiCheckpointSurfaceJson: '{"root":{"type":"Sparkles"}}' } } : node)) };
  const result = await (await request.post(`${API_URL}/api/graphs/validate`, { data: bad })).json();
  const diagnostic = result.diagnostics.find((d: { code: string; node_id?: string }) => d.code === "NODE_CONFIG_INVALID" && d.node_id === "gate_1");
  expect(diagnostic?.message).toMatch(/isn't a GenUI surface/);
});
