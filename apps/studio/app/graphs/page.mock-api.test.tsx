import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHandlers, createMockStore, makeGraph } from "@bstockwelldev/agent-graph-sdk/testing";

import GraphsPage from "./page";

// SDK 5/7 (STO-620): a consumer test on the SDK's /testing kit -- the real
// Studio client and page against the in-memory mock API, with no backend
// and no module mocks of the client.

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const store = createMockStore({ graphs: [makeGraph({ id: "support", name: "Support flow" })] });
const server = setupServer(...createHandlers({ store }));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => cleanup());
afterAll(() => server.close());

describe("/graphs against the mock API", () => {
  it("lists graphs from the store and creates one from the demo template", async () => {
    render(<GraphsPage />);
    expect(await screen.findByText("Support flow")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New from demo template" }));
    expect(await screen.findByText("Demo graph")).toBeTruthy();
    await waitFor(() => expect([...store.graphs.values()].map((graph) => graph.name)).toEqual(["Support flow", "Demo graph"]));
    const demo = [...store.graphs.values()][1];
    expect(demo.nodes).toHaveLength(8);
  });
});
