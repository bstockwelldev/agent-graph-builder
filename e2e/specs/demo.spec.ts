import { DEMO_MODE_API_URL, expect, pickOption, test } from "../fixtures";

const DEMO_ID = "demo_classify_and_route";

test("editing the seeded demo saves a copy and leaves the demo untouched", async ({ page, api }) => {
  await page.goto(`/graphs/${DEMO_ID}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await expect(page.getByRole("status").first()).toHaveText("Saved");

  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByRole("button", { name: /^Transform/ }).click();
  await page.keyboard.press("ControlOrMeta+s");

  await expect(page).toHaveURL(/\/graphs\/graph_[^/?]+/);
  await expect(page.getByRole("textbox", { name: "Graph name" })).toHaveValue(/\(copy\)$/);
  const copyId = new URL(page.url()).pathname.split("/").pop()!;
  expect((await api.getGraph(copyId)).nodes).toHaveLength(9);
  expect((await api.getGraph(DEMO_ID)).nodes).toHaveLength(8);
});

test.describe("public demo mode", () => {
  test("live providers need the visitor's own key; Stub still runs", async ({ page, request, demoModeApi: _ }) => {
    expect(await (await request.get(`${DEMO_MODE_API_URL}/api/health`)).json()).toMatchObject({ public_demo_mode: true });
    await page.goto(`/graphs/${DEMO_ID}?panel=run`);
    await expect(page.locator(".react-flow__node")).toHaveCount(8);

    await page.getByRole("button", { name: /^Model: / }).click();
    await pickOption(page, "Model provider", /^Groq/);
    await expect(page.getByPlaceholder(/GROQ_API_KEY/)).toBeVisible();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText(/Live providers on this public demo need your own API key/)).toBeVisible();

    await pickOption(page, "Model provider", /^Stub/);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText("Succeeded").first()).toBeVisible();
    await expect(page.getByText(/A database index is a data structure/).first()).toBeVisible();
  });

  test("workspace policies are read-only", async ({ page, request, demoModeApi: _ }) => {
    await page.goto("/policies");
    const rule = page.getByRole("combobox", { name: "LLM model not pinned enforcement" });
    await expect(rule).toContainText("Default (Warn)");
    await rule.click();
    await page.getByRole("option", { name: /^Block(?! publish)/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Workspace policies are read-only on the public demo" })).toBeVisible();
    // The change was refused and nothing was stored.
    await expect(rule).toContainText("Default (Warn)");
    expect((await (await request.get(`${DEMO_MODE_API_URL}/api/policies/workspace`)).json()).rules).toEqual({});
  });
});
