import { API_URL, expect, openGraph, pickOption, save, test, validationChip } from "../fixtures";

test("classified data flowing into a tool is blocked until waived", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph("E2E classification");
  await openGraph(page, graph, "?node=input_1");

  await page.getByRole("tab", { name: /I\/O/ }).click();
  await page.getByRole("radiogroup", { name: "Output contract" }).getByRole("radio", { name: "Declared" }).click();
  await pickOption(page, "output classification", /^Confidential/);
  await expect(page.getByRole("status").first()).toHaveText("Unsaved");

  // The classification propagates through prompt → llm → router into the tool.
  await expect(validationChip(page)).toHaveAccessibleName("Validate graph (1 error)");
  await save(page);

  await page.locator('.react-flow__node[data-id="tool_lookup"]').click();
  await page.getByRole("tab", { name: /Policy/ }).click();
  await expect(page.getByText(/carries confidential data \(declared on 'input_1'\)/)).toBeVisible();
  await page.getByRole("button", { name: "Waive for 30 days" }).click();

  // The waiver is recorded server-side and the diagnostic stops blocking.
  await expect(validationChip(page)).not.toHaveAccessibleName(/error/);
  const exceptions = await (await request.get(`${API_URL}/api/graphs/${graph.id}/policy-exceptions`)).json();
  expect(exceptions).toMatchObject([{ policy_code: "POLICY_SENSITIVE_DATA_INTO_TOOL", node_id: "tool_lookup" }]);
});
