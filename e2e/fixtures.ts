import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

export const API_URL = "http://127.0.0.1:8000";

export type GraphNodeJson = { id: string; type: string; config?: Record<string, unknown>; [key: string]: unknown };
export type GraphJson = { id: string; name: string; nodes: GraphNodeJson[]; edges: { id: string; source: string; target: string }[] };

/** Talks to the backend directly, for arranging state and asserting what was persisted. */
export class Api {
  constructor(private readonly request: APIRequestContext) {}

  /** A fresh copy of the demo graph, so each test owns (and can mutate) its graph. */
  async createDemoGraph(name: string): Promise<GraphJson> {
    const response = await this.request.post(`${API_URL}/api/graphs`, { data: { name, template: "demo" } });
    expect(response.ok(), await response.text()).toBeTruthy();
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

export const test = base.extend<{ api: Api }>({
  api: async ({ request }, use) => {
    await use(new Api(request));
  },
});

export { expect };
