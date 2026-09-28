import { expect, test } from "@playwright/test";

const DEMO_ID = "demo_classify_and_route";

test("the API is healthy on shared storage, in public demo mode", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const health = await response.json();
  expect(health.ok).toBe(true);
  // Without a shared store the API refuses (503); SQLite would lose runs between isolates.
  expect(health.storage_backend).not.toBe("sqlite");
  expect(health.public_demo_mode).toBe(true);
});

test("the seeded demo opens and runs on Stub", async ({ page }) => {
  // A Stub run is what any visitor can do; it records one run in production storage.
  await page.goto(`/graphs/${DEMO_ID}?panel=run`);
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await expect(page.getByRole("status").first()).toHaveText("Saved");

  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page).toHaveURL(/[?&]run=run_/);
  await expect(page.getByText(/A database index is a data structure/).first()).toBeVisible();
  for (const nodeId of ["tool_lookup", "output_1"]) {
    await expect(page.locator(`.react-flow__node[data-id="${nodeId}"]`)).toContainText(/succeeded/i);
  }
});
