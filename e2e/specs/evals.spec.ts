import { API_URL, expect, openGraph, test } from "../fixtures";

// Scored evals: a dataset with expectations, a suite made from it in the
// graph's Evals panel, Stub runs, per-case reasons, and a comparison.

test("scores a graph against a dataset's expectations and compares two runs", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph(`E2E evals ${Date.now()}`);
  const datasetId = `ds_evals_${Date.now()}`;
  await request.post(`${API_URL}/api/datasets`, {
    data: {
      id: datasetId,
      name: `Eval questions ${Date.now()}`,
      fixtures: [
        { input: { question: "how does a database index work" }, expected: { contains: ["database index"], route: { router_1: "tool_lookup" } } },
        { input: { question: "tell me a joke" }, expected: { contains: ["punchline"] } },
      ],
    },
  });

  await openGraph(page, graph, "?panel=evals");
  await expect(page.getByText(/No eval suites for this graph/)).toBeVisible();
  await page.getByRole("combobox", { name: "Dataset" }).selectOption(datasetId);
  await page.getByRole("button", { name: "Create suite" }).click();

  // First run: the technical case passes, the joke case fails and says why.
  await page.getByRole("button", { name: "Run suite" }).click();
  const result = page.getByRole("status", { name: "Eval result" });
  await expect(result).toContainText("pass rate 50%");
  const cases = page.getByRole("table", { name: "Eval cases" });
  await expect(cases).toContainText("Pass");
  await expect(cases).toContainText("missing: punchline");

  // Fix the expectation and run again: the comparison shows the gain.
  const dataset = await (await request.get(`${API_URL}/api/datasets/${datasetId}`)).json();
  dataset.fixtures[1].expected = { contains: ["stub answer"] };
  await request.put(`${API_URL}/api/datasets/${datasetId}`, { data: dataset });
  await page.getByRole("button", { name: "Run suite" }).click();
  await expect(result).toContainText("pass rate 100%");
  await expect(page.getByRole("list", { name: "Eval runs" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: /^Compare evr_\w+ with the run before$/ }).click();
  await expect(page.getByRole("region", { name: "Eval comparison" })).toContainText("pass rate +50 pts");

  // A case opens its run.
  await page.getByRole("button", { name: "Open the run for case 1" }).click();
  await expect(page).toHaveURL(/[?&]run=run_/);
});
