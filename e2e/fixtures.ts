import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { addCoverage, coverageEnabled, withSourceMaps } from "./coverage";

export const API_URL = "http://127.0.0.1:8000";
/** The same API with PUBLIC_DEMO_MODE=1 (see playwright.config.ts). */
export const DEMO_MODE_API_URL = "http://127.0.0.1:8001";

export type GraphNodeJson = { id: string; type: string; config?: Record<string, unknown>; [key: string]: unknown };
export type GraphEdgeJson = { id: string; source: string; target: string; transform?: Record<string, unknown> | null; [key: string]: unknown };
export type GraphJson = { id: string; name: string; nodes: GraphNodeJson[]; edges: GraphEdgeJson[] };

/** Talks to the backend directly, for arranging state and asserting what was persisted. */
export class Api {
  constructor(private readonly request: APIRequestContext) {}

  /** A fresh copy of the demo graph, so each test owns (and can mutate) its graph. */
  async createDemoGraph(name: string): Promise<GraphJson> {
    const response = await this.request.post(`${API_URL}/api/graphs`, { data: { name, template: "demo" } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }

  async updateGraph(graph: GraphJson): Promise<void> {
    const response = await this.request.put(`${API_URL}/api/graphs/${graph.id}`, { data: graph });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async getRun(id: string): Promise<{ status: string; result: unknown; error: string | null }> {
    const response = await this.request.get(`${API_URL}/api/runs/${id}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async getGraph(id: string): Promise<GraphJson> {
    const response = await this.request.get(`${API_URL}/api/graphs/${id}`);
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
}

/** Opens a graph in the editor and waits for the canvas to render its nodes. */
export async function openGraph(page: Page, graph: GraphJson, query = ""): Promise<void> {
  await page.goto(`/graphs/${graph.id}${query}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(graph.nodes.length);
}

/**
 * Drags a connection from one node's output handle to another's input
 * handle. Done with raw mouse steps: while a connection is being dragged,
 * the target card overlays its handle, so `locator.dragTo` never sees the
 * handle as the hit target. Waits for the viewport to settle first (adding a
 * node or opening the inspector animates the canvas).
 */
export async function connectNodes(page: Page, sourceId: string, targetId: string): Promise<void> {
  await waitForCanvasToSettle(page);
  const center = async (selector: string) => {
    const box = await page.locator(selector).boundingBox();
    if (!box) throw new Error(`${selector} is not visible`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const from = await center(`.react-flow__node[data-id="${sourceId}"] .react-flow__handle.source`);
  const to = await center(`.react-flow__node[data-id="${targetId}"] .react-flow__handle.target`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/** Resolves once the React Flow viewport transform stops changing. */
export async function waitForCanvasToSettle(page: Page): Promise<void> {
  const viewport = page.locator(".react-flow__viewport");
  let previous = "";
  await expect
    .poll(
      async () => {
        const current = (await viewport.getAttribute("style")) ?? "";
        const settled = current === previous;
        previous = current;
        return settled;
      },
      { intervals: [150] },
    )
    .toBe(true);
}

/** The header's validation chip, e.g. "Validate graph (1 error)". */
export function validationChip(page: Page) {
  return page.getByRole("button", { name: /^Validate graph/ });
}

/** Picks an option in one of the studio's comboboxes (options select on mousedown). */
export async function pickOption(page: Page, combobox: string | RegExp, option: RegExp): Promise<void> {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option }).dispatchEvent("mousedown");
}

export async function save(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByRole("status").first()).toHaveText("Saved");
}

/**
 * Reopens the (saved) graph with the run panel showing, starts a run on the
 * stub provider and waits for it to settle; returns the run id.
 */
export async function runOnStub(page: Page, graph: GraphJson): Promise<string> {
  await openGraph(page, graph, "?panel=run");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page).toHaveURL(/[?&]run=run_/);
  const runId = new URL(page.url()).searchParams.get("run")!;
  const api = new Api(page.request);
  await expect.poll(async () => (await api.getRun(runId)).status).toMatch(/^(succeeded|failed)$/);
  return runId;
}

/**
 * Sends this page's /api calls to the PUBLIC_DEMO_MODE backend. Proxied with
 * route.fetch + fulfill: Chromium refuses a cross-origin `continue`. Use it
 * through the `demoModeApi` fixture, which drops the route (and any fetch
 * still in flight, e.g. a poll) when the test ends.
 */
async function routeApiToDemoMode(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const target = `${DEMO_MODE_API_URL}${url.pathname}${url.search}`;
    await route.fulfill({ response: await route.fetch({ url: target }) });
  });
}

export const test = base.extend<{ api: Api; demoModeApi: void }>({
  // E2E_COVERAGE=1: collect V8 JS coverage for every test's page (see coverage.ts).
  page: async ({ page, browserName }, use) => {
    if (!coverageEnabled || browserName !== "chromium") return use(page);
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use(page);
    const entries = await page.coverage.stopJSCoverage();
    await addCoverage(await withSourceMaps(entries, page.request));
  },
  api: async ({ request }, use) => {
    await use(new Api(request));
  },
  /** Request this fixture to run the test's page against the PUBLIC_DEMO_MODE backend. */
  demoModeApi: async ({ page }, use) => {
    await routeApiToDemoMode(page);
    await use();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  },
});

export { expect };
