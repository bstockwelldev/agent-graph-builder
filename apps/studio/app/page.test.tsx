import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHandlers, createMockStore, demoGraph, makeGraph } from "@bstockwelldev/agent-graph-sdk/testing";

import { LAST_GRAPH_KEY } from "@/lib/lastGraph";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace, push: nav.push }), usePathname: () => "/" }));

import { GraphPicker, GraphPickerProvider } from "@/components/studio/graph-picker";
import HomePage from "./page";

const store = createMockStore({ graphs: [demoGraph(), makeGraph({ id: "support", name: "Support flow" })] });
const server = setupServer(...createHandlers({ store }));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const renderHome = () =>
  render(
    <GraphPickerProvider>
      <HomePage />
      <GraphPicker />
    </GraphPickerProvider>,
  );

// canvas-first-landing-plan.md §3 and §7 AC 1-2.
describe("/ landing", () => {
  it("reopens the last graph, with no list in between", async () => {
    window.localStorage.setItem(LAST_GRAPH_KEY, "support");
    renderHome();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/graphs/support"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("empty-canvas")).toBeNull();
    expect(screen.queryByText("Support flow")).toBeNull();
  });

  it("keeps ?panel= and related params when it reopens", async () => {
    window.localStorage.setItem(LAST_GRAPH_KEY, "support");
    window.history.replaceState(null, "", "/?panel=prompts&id=p_1&tab=usage");
    renderHome();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/graphs/support?panel=prompts&id=p_1&tab=usage"));
  });

  it("opens the picker over the empty canvas when there is no last graph", async () => {
    renderHome();
    expect(await screen.findByRole("dialog", { name: "Open graph" })).toBeTruthy();
    expect(screen.getByTestId("empty-canvas")).toBeTruthy();
    // Behind the modal, so hidden from the accessibility tree while the picker is open.
    expect(screen.getByRole("button", { name: "Open or create a graph", hidden: true })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    // The demo is listed once, in Demos.
    expect(await screen.findAllByRole("link", { name: /Classify & Route/ })).toHaveLength(1);
  });

  it("forgets a last graph that no longer exists and shows the picker", async () => {
    window.localStorage.setItem(LAST_GRAPH_KEY, "deleted_long_ago");
    renderHome();
    expect(await screen.findByRole("dialog", { name: "Open graph" })).toBeTruthy();
    expect(window.localStorage.getItem(LAST_GRAPH_KEY)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("?open=picker skips the reopen", async () => {
    window.localStorage.setItem(LAST_GRAPH_KEY, "support");
    window.history.replaceState(null, "", "/?open=picker");
    renderHome();
    expect(await screen.findByRole("dialog", { name: "Open graph" })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LAST_GRAPH_KEY)).toBe("support");
  });

  it("falls back to the picker when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderHome();
    expect(await screen.findByRole("dialog", { name: "Open graph" })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows the picker, with its error, when the API is unreachable", async () => {
    window.localStorage.setItem(LAST_GRAPH_KEY, "support");
    server.use(http.get("*/api/graph-summaries", () => HttpResponse.json({ detail: "down" }, { status: 500 })));
    renderHome();
    expect(await screen.findByRole("dialog", { name: "Open graph" })).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("down");
    expect(nav.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(LAST_GRAPH_KEY)).toBe("support");
  });
});
