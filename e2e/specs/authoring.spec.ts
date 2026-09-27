import { connectNodes, expect, openGraph, test } from "../fixtures";

test("adds a node from the palette, connects and configures it, and saves", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E authoring");
  await openGraph(page, graph);
  const saveState = page.getByRole("status").first();
  await expect(saveState).toHaveText("Saved");

  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByRole("button", { name: /^Transform/ }).click();
  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(graph.nodes.length + 1);
  const transformId = await nodes.last().getAttribute("data-id");
  expect(transformId).toMatch(/^transform_/);
  await expect(saveState).toHaveText("Unsaved");

  // Connect llm_answer → the new transform by dragging between handles.
  const edges = page.locator(".react-flow__edge");
  await expect(edges).toHaveCount(graph.edges.length);
  await connectNodes(page, "llm_answer", transformId!);
  await expect(edges).toHaveCount(graph.edges.length + 1);

  // Configure it in the inspector.
  await nodes.last().click();
  await page.getByLabel("Message template").fill("Answer: {value}");

  await page.keyboard.press("ControlOrMeta+s");
  await expect(saveState).toHaveText("Saved");

  const saved = await api.getGraph(graph.id);
  const transform = saved.nodes.find((node) => node.id === transformId);
  expect(transform?.config).toMatchObject({ template: "Answer: {value}" });
  expect(saved.edges.some((edge) => edge.source === "llm_answer" && edge.target === transformId)).toBe(true);

  await page.reload();
  await expect(nodes).toHaveCount(graph.nodes.length + 1);
  await expect(saveState).toHaveText("Saved");
});
