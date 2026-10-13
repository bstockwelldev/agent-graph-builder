import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useEffect } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHandlers, createMockStore, demoGraph, makeGraph } from "@bstockwelldev/agent-graph-sdk/testing";

import { LAST_GRAPH_KEY } from "@/lib/lastGraph";

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: "/graphs/support" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn() }), usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({
  default: ({ children, href, onClick, "aria-current": current }: { children: React.ReactNode; href: string; onClick?: () => void; "aria-current"?: "page" }) => (
    <a
      href={href}
      aria-current={current}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

import { GraphPicker, GraphPickerProvider, useGraphPicker } from "./GraphPicker";

// The seeded demo is stored like any graph, so the summaries list returns it too.
// A fresh store per test: several tests delete graphs.
const freshStore = () =>
  createMockStore({
    graphs: [demoGraph(), makeGraph({ id: "support", name: "Support flow" }), makeGraph({ id: "billing", name: "Billing triage" })],
  });
let store = freshStore();
const server = setupServer(...createHandlers({ store }));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  store = freshStore();
  server.resetHandlers(...createHandlers({ store }));
  nav.push.mockReset();
  nav.pathname = "/graphs/support";
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterAll(() => server.close());

function renderPicker(open = true) {
  function OpenOnMount() {
    const picker = useGraphPicker();
    useEffect(() => {
      if (open) picker.open();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
  }
  return render(
    <GraphPickerProvider>
      <OpenOnMount />
      <GraphPicker />
    </GraphPickerProvider>,
  );
}

const confirmDelete = async (name: string) => fireEvent.click(await screen.findByRole("button", { name: `Confirm delete ${name}` }));

describe("graph picker", () => {
  it("lists your graphs under Recent and each demo once under Demos", async () => {
    renderPicker();
    const dialog = await screen.findByRole("dialog", { name: "Open graph" });
    const recent = await within(dialog).findByRole("region", { name: "Recent graphs" });
    expect(within(recent).getByText("Support flow")).toBeTruthy();
    expect(within(recent).getByText("Billing triage")).toBeTruthy();
    expect(within(recent).queryByText(demoGraph().name)).toBeNull();

    const demos = within(dialog).getByRole("region", { name: "Seeded demos" });
    expect(within(demos).getAllByRole("link", { name: /Classify & Route/ })).toHaveLength(1);
    expect(within(dialog).getAllByRole("link").filter((link) => link.getAttribute("href") === `/graphs/${demoGraph().id}`)).toHaveLength(1);
  });

  it("filters by name, id or tagline, and says when nothing matches", async () => {
    renderPicker();
    const dialog = await screen.findByRole("dialog", { name: "Open graph" });
    await within(dialog).findByText("Support flow");
    const search = within(dialog).getByRole("searchbox", { name: "Search graphs" });
    // The graph that is open is marked.
    expect(within(dialog).getByRole("link", { name: /Support flow/ }).getAttribute("aria-current")).toBe("page");

    fireEvent.change(search, { target: { value: "billing" } });
    expect(within(dialog).queryByText("Support flow")).toBeNull();
    expect(within(dialog).getByText("Billing triage")).toBeTruthy();

    fireEvent.change(search, { target: { value: "zzz-nothing" } });
    expect(within(dialog).getByRole("status").textContent).toContain("No graphs match");
  });

  it("opens the first match with Enter on the search box, and closes", async () => {
    renderPicker();
    const search = await screen.findByRole("searchbox", { name: "Search graphs" });
    await screen.findByText("Billing triage");
    fireEvent.change(search, { target: { value: "billing" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(nav.push).toHaveBeenCalledWith("/graphs/billing");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Open graph" })).toBeNull());
  });

  it("asks inline before deleting, and Cancel keeps the graph", async () => {
    renderPicker();
    await screen.findByText("Billing triage");
    fireEvent.click(screen.getByRole("button", { name: "Delete Billing triage" }));
    expect(screen.getByText(/Delete “Billing triage”\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Billing triage")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Confirm delete/ })).toBeNull();
    expect(store.graphs.has("billing")).toBe(true);
  });

  // The picker is how you choose what goes on the canvas, so it is styled like the canvas.
  // Every shadcn primitive carries a data-slot: none may appear (the CRUD pages' look).
  it("is styled from the canvas tokens, with no shadcn primitive in it", async () => {
    renderPicker();
    const dialog = await screen.findByRole("dialog", { name: "Open graph" });
    await within(dialog).findByText("Support flow");
    expect(dialog.querySelector("[data-slot]")).toBeNull();
    // And the browser's own history of past entries mustn't float over the list.
    expect(within(dialog).getByRole("searchbox", { name: "Search graphs" }).getAttribute("autocomplete")).toBe("off");
  });

  it("closes on Escape", async () => {
    renderPicker();
    await screen.findByRole("dialog", { name: "Open graph" });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Open graph" })).toBeNull());
  });

  it("opens with ⌘O, and with ?open=picker, which it then removes from the URL", async () => {
    renderPicker(false);
    expect(screen.queryByRole("dialog", { name: "Open graph" })).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: "o", metaKey: true });
    });
    expect(await screen.findByRole("dialog", { name: "Open graph" })).toBeTruthy();
    cleanup();

    window.history.replaceState(null, "", "/?open=picker&panel=prompts");
    renderPicker(false);
    expect(await screen.findByRole("dialog", { name: "Open graph" })).toBeTruthy();
    expect(window.location.search).toBe("?panel=prompts");
  });

  it("creates a blank graph and opens it", async () => {
    renderPicker();
    await screen.findByText("Support flow");
    const before = store.graphs.size;
    fireEvent.click(screen.getByRole("button", { name: "New blank graph" }));
    await waitFor(() => expect(store.graphs.size).toBe(before + 1));
    const created = [...store.graphs.values()].at(-1)!;
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/graphs/${created.id}`));
  });

  it("deletes only your own graphs, behind a confirm, and forgets a deleted last graph", async () => {
    window.localStorage.setItem(LAST_GRAPH_KEY, "billing");
    renderPicker();
    await screen.findByText("Billing triage");
    expect(screen.queryByRole("button", { name: `Delete ${demoGraph().name}` })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete Billing triage" }));
    expect(store.graphs.has("billing")).toBe(true);
    await confirmDelete("Billing triage");
    await waitFor(() => expect(store.graphs.has("billing")).toBe(false));
    expect(window.localStorage.getItem(LAST_GRAPH_KEY)).toBeNull();
    await waitFor(() => expect(screen.queryByText("Billing triage")).toBeNull());
  });

  it("deleting the open graph goes back to the empty canvas", async () => {
    renderPicker();
    await screen.findByText("Support flow");
    fireEvent.click(screen.getByRole("button", { name: "Delete Support flow" }));
    await confirmDelete("Support flow");
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/?open=picker"));
  });

  it("shows a failed delete inline and keeps the list", async () => {
    server.use(http.delete("*/api/graphs/:id", () => HttpResponse.json({ detail: "storage unavailable" }, { status: 500 })));
    renderPicker();
    await screen.findByText("Billing triage");
    fireEvent.click(screen.getByRole("button", { name: "Delete Billing triage" }));
    await confirmDelete("Billing triage");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("storage unavailable");
    expect(screen.getByText("Billing triage")).toBeTruthy();
  });

  it("says why the list is empty when the API fails, and retries", async () => {
    server.use(http.get("*/api/graph-summaries", () => HttpResponse.json({ detail: "down" }, { status: 500 })));
    renderPicker();
    expect((await screen.findByRole("alert")).textContent).toContain("down");
    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Support flow")).toBeTruthy();
  });
});
