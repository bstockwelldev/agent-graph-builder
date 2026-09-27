import { expect, openGraph, pickOption, runOnStub, save, test, validationChip } from "../fixtures";

test("a declared kind mismatch blocks until an edge transform converts it", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E contracts");
  await openGraph(page, graph, "?node=tool_lookup");
  await expect(validationChip(page)).not.toHaveAccessibleName(/error/);

  // Declare the tool's output (tool-result) and the output node's input as message.
  await page.getByRole("tab", { name: /I\/O/ }).click();
  await page.getByRole("radiogroup", { name: "Output contract" }).getByRole("radio", { name: "Declared" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Unsaved");

  await page.locator('.react-flow__node[data-id="output_1"]').click();
  await page.getByRole("tab", { name: /I\/O/ }).click();
  await page.getByRole("radiogroup", { name: "Input contract" }).getByRole("radio", { name: "Declared" }).click();
  await pickOption(page, "input kind", /^message/i);

  // Explicit-vs-explicit mismatch on the tool → output edge blocks.
  await expect(validationChip(page)).toHaveAccessibleName("Validate graph (1 error)");
  await save(page);
  const declared = await api.getGraph(graph.id);
  expect(declared.nodes.find((n) => n.id === "output_1")?.input_ports).toMatchObject([{ contract: { kind: "message" } }]);

  // A format_message transform on that edge converts tool-result → message.
  await page.goto(`/graphs/${graph.id}?edge=e_tool_output`);
  await page.getByRole("button", { name: /Add transform/ }).click();
  await page.getByRole("radio", { name: "Format" }).click();
  await page.getByLabel("Message template").fill("Fact: {value}");
  await expect(validationChip(page)).not.toHaveAccessibleName(/error/);
  await save(page);
  const fixed = await api.getGraph(graph.id);
  expect(fixed.edges.find((e) => e.id === "e_tool_output")?.transform).toMatchObject({ type: "format_message", template: "Fact: {value}" });

  // And it still runs.
  const run = await api.getRun(await runOnStub(page, fixed));
  expect(run.status).toBe("succeeded");
});
