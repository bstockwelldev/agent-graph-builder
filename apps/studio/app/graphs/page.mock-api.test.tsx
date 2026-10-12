import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHandlers, createMockStore, demoGraph, makeGraph } from "@bstockwelldev/agent-graph-sdk/testing";

import GraphsPage from "./page";

// SDK 5/7 (STO-620): a consumer test on the SDK's /testing kit -- the real
// Studio client and page against the in-memory mock API, with no backend
// and no module mocks of the client.

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

// The seeded demo is stored like any graph, so the summaries list returns it too.
const store = createMockStore({ graphs: [demoGraph(), makeGraph({ id: "support", name: "Support flow" })] });
const server = setupServer(...createHandlers({ store }));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

describe("/graphs against the mock API", () => {
  it("shows each seeded demo once, in the gallery, and the user's graphs below it", async () => {
    render(<GraphsPage />);
    const yours = await screen.findByRole("region", { name: "Your graphs" });
    expect(within(yours).getByText("Support flow")).toBeTruthy();
    expect(within(yours).queryByText(demoGraph().name)).toBeNull();

    const gallery = screen.getByRole("region", { name: "Seeded demos" });
    expect(within(gallery).getAllByRole("link", { name: /Classify & Route/ })).toHaveLength(1);
    expect(screen.getAllByRole("link").filter((link) => link.getAttribute("href") === `/graphs/${demoGraph().id}`)).toHaveLength(1);
  });

  it("scrolls inside the page, since the shell clamps /graphs to the viewport", async () => {
    render(<GraphsPage />);
    await screen.findByRole("region", { name: "Your graphs" });
    expect(screen.getByTestId("graphs-scroll").className).toContain("overflow-y-auto");
  });

  it("creates a blank graph", async () => {
    render(<GraphsPage />);
    await screen.findByText("Support flow");
    expect(screen.queryByRole("button", { name: "New from demo template" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New blank graph" }));
    await waitFor(() => expect([...store.graphs.values()]).toHaveLength(3));
    const created = [...store.graphs.values()][2];
    expect(await screen.findByText(created.name)).toBeTruthy();
  });

  it("keeps the list when a delete fails, and says why", async () => {
    server.use(http.delete("*/api/graphs/:id", () => HttpResponse.json({ detail: "storage unavailable" }, { status: 500 })));
    render(<GraphsPage />);
    await screen.findByText("Support flow");
    fireEvent.click(screen.getByRole("button", { name: "Delete Support flow" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Support flow")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Seeded demos" })).toBeTruthy();
  });
});
