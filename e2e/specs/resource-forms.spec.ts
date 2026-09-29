import { API_URL, expect, test } from "../fixtures";

// resource-forms-consistency-plan.md, slice 2: name-first ids (C1), provider
// and model pickers (C2/C3/C5), validated JSON (C4), required fields that
// say what's missing (C6), and a resource tab strip that shows it scrolls.

test("an LLM profile picks its provider and derives its id from the name", async ({ page, request }) => {
  const stamp = Date.now();
  const name = `E2E fast ${stamp}`;
  await page.goto("/llm-profiles");
  await page.getByRole("button", { name: /New LLM profile/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "New LLM profile" });

  await expect(dialog.getByText("To save: Add a name. Pick a model.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await dialog.getByLabel("Name").fill(name);
  await expect(dialog.getByText(new RegExp(`^e2e_fast_${stamp}_[0-9a-f]{4}$`))).toBeVisible();

  // Provider is a select over the chat providers, not free text.
  await expect(dialog.getByRole("combobox", { name: "Provider" })).toHaveText(/Stub/);
  await dialog.getByLabel("Model").fill("stub-small");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const profiles: { id: string; name: string; model: string; model_provider: string }[] = await (await request.get(`${API_URL}/api/llm-profiles`)).json();
  const created = profiles.find((profile) => profile.name === name)!;
  expect(created).toMatchObject({ model: "stub-small", model_provider: "stub" });
  expect(created.id).toMatch(new RegExp(`^e2e_fast_${stamp}_[0-9a-f]{4}$`));

  // After create the id is display-only.
  await page.getByRole("button", { name: `Edit LLM profile ${name}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit LLM profile" });
  await expect(edit.getByRole("button", { name: `Copy id ${created.id}` })).toBeVisible();
  await expect(edit.getByRole("textbox", { name: "Id", exact: true })).toHaveCount(0);
});

test("a tool's parameters must be a JSON object before it saves", async ({ page, request }) => {
  const toolName = `e2e_tool_${Date.now()}`;
  await page.goto("/tools");
  await page.getByRole("button", { name: /New tool/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "New tool" });

  await dialog.getByLabel("Tool name").fill(toolName);
  await dialog.getByLabel("Description").fill("Looks things up");
  const params = dialog.getByLabel("Parameters (JSON Schema)");
  await params.fill('{"type": "object",');
  await expect(params).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText(/^To save: Parameters aren't valid JSON/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

  await params.fill('{ "type": "object" }');
  await expect(params).not.toHaveAttribute("aria-invalid", "true");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const tool = await (await request.get(`${API_URL}/api/tools/${toolName}`)).json();
  expect(tool.parameters_json).toBe('{"type":"object"}');
});

test("on a narrow screen the resource tabs scroll the current one into view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/transforms");
  const tabs = page.getByRole("navigation", { name: "Resource types" });
  await expect(tabs.getByRole("link", { name: "Transforms" })).toBeInViewport();
  // A fade marks the end with tabs scrolled out of sight.
  await expect(tabs).toHaveAttribute("data-overflow", /^(start|both)$/);
});
