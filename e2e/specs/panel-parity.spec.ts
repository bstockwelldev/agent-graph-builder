import type { Page } from "@playwright/test";

import { API_URL, expect, openGraph, pickOption, test, waitForCanvasToSettle } from "../fixtures";

// Canvas-first landing plan, Phase 2: the resource registries, workspace
// policies and the GenUI catalog as workbench panels on the graph canvas.

const PANELS = [
  ["Agents", "agents"],
  ["Prompts", "prompts"],
  ["Tools", "tools"],
  ["MCP", "mcp"],
  ["LLM Profiles", "llmProfiles"],
  ["Transforms", "transforms"],
  ["Datasets", "datasets"],
  ["Eval suites", "evalSuites"],
  ["Workspace policies", "workspacePolicies"],
  ["GenUI catalog", "genui"],
] as const;

async function openFromPalette(page: Page, title: string) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder(/canvas action/).fill(title);
  // The route entries share names with the panels; the panel lives in the Workbench group.
  await page.getByRole("group", { name: "Workbench" }).getByRole("option", { name: title, exact: true }).click();
}

for (const [title, panel] of PANELS) {
  test(`${title} opens from the command palette on a graph`, async ({ page, api }) => {
    const graph = await api.createDemoGraph(`E2E parity ${panel} ${Date.now()}`);
    await openGraph(page, graph);
    await waitForCanvasToSettle(page);
    await openFromPalette(page, title);
    await expect(page.getByRole("button", { name: `Close ${title}` })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]panel=${panel}(&|$)`));
  });
}

test("a docked resource panel reserves its column: no node lies under it", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E parity dock ${Date.now()}`);
  await openGraph(page, graph);
  await waitForCanvasToSettle(page);
  await openFromPalette(page, "Prompts");
  const panel = page.locator("[data-workbench-panel]").filter({ has: page.getByRole("button", { name: "Close Prompts" }) });
  await expect(panel).toBeVisible();
  await waitForCanvasToSettle(page);

  const overlap = async () => {
    const panelBox = (await panel.boundingBox())!;
    const nodes = await page.locator(".react-flow__node").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
    return nodes.filter((right) => right > panelBox.x + 1).length;
  };
  await expect.poll(overlap).toBe(0);
});

test("the kind switcher moves between registries", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E parity switch ${Date.now()}`);
  await openGraph(page, graph, "?panel=prompts");
  await pickOption(page, "Resource kind", /^Datasets$/);
  await expect(page.getByRole("button", { name: "Close Datasets" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]panel=datasets/);
});

test("?panel=<kind>&id=&tab= opens that resource's editor on its tab", async ({ page, api, request }) => {
  const id = `e2e_parity_${Date.now()}`;
  expect((await request.post(`${API_URL}/api/prompts`, { data: { id, name: `Parity ${id}`, body: "Hi {name}" } })).ok()).toBe(true);
  const graph = await api.createDemoGraph(`E2E parity deep link ${Date.now()}`);
  await openGraph(page, graph, `?panel=prompts&id=${id}&tab=usage`);
  const dialog = page.getByRole("dialog", { name: "Edit prompt" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Usage/ })).toHaveAttribute("aria-selected", "true");
});

test("?panel=analytics&scope=workspace opens the workspace scope", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E parity scope ${Date.now()}`);
  await openGraph(page, graph, "?panel=analytics&scope=workspace");
  await expect(page.getByRole("radiogroup", { name: "Analytics scope" }).getByRole("radio", { name: "Workspace" })).toBeChecked();
});

test("a graph's Policies panel links to the workspace policies panel", async ({ page, api }) => {
  const graph = await api.createDemoGraph(`E2E parity policies ${Date.now()}`);
  await openGraph(page, graph, "?panel=policies");
  await page.getByRole("button", { name: "workspace policies" }).click();
  await expect(page.getByRole("button", { name: "Close Workspace policies" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]panel=workspacePolicies/);
});
