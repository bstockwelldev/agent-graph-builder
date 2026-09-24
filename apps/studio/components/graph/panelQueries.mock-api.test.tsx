import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { summarizeGraph } from "@bstockwelldev/agent-graph-sdk/graph";
import { AgentGraphProvider } from "@bstockwelldev/agent-graph-sdk/react";
import { createHandlers, createMockStore, demoGraph, makeGraph } from "@bstockwelldev/agent-graph-sdk/testing";
import { setupServer } from "msw/node";
import { StrictMode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { client } from "@/lib/api-client";
import { ChatRunPicker } from "@/components/workbench/panels/ChatRunPicker";
import { NodeImpactTab } from "./NodeImpactTab";
import { PolicyPanel } from "./PolicyPanel";
import { SubgraphConfig } from "./SubgraphConfig";

// SDK 6/7 (STO-618): the four panels on /react hooks, mounted together under
// StrictMode against the /testing mock API. The old useEffect loaders
// fetched twice under StrictMode, and each panel fetched separately; with
// the shared query cache, every endpoint is requested exactly once.

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const store = createMockStore({ graphs: [demoGraph(), makeGraph({ id: "parent", name: "Parent" })] });
const server = setupServer(...createHandlers({ store }));
const requests: string[] = [];
server.events.on("request:start", ({ request }) => {
  requests.push(`${request.method} ${new URL(request.url).pathname}`);
});

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "error" });
  await client.releases.publish("demo_classify_and_route");
  requests.length = 0;
});
afterEach(() => cleanup());
afterAll(() => server.close());

describe("panels on /react hooks", () => {
  it("fetch each endpoint once on mount, sharing the cache across panels", async () => {
    const demo = demoGraph();
    render(
      <StrictMode>
        <AgentGraphProvider client={client}>
          <NodeImpactTab graphId="demo_classify_and_route" nodeId="router_1" getDraftGraph={() => demo} />
          <SubgraphConfig
            node={{ id: "sub", type: "subgraph", position: { x: 0, y: 0 }, config: { graphId: "demo_classify_and_route", version: "latest" } }}
            graphId="parent"
            set={() => undefined}
            fieldIssues={() => []}
            variables={["question"]}
          />
          <PolicyPanel graphId="demo_classify_and_route" />
          <ChatRunPicker graphs={[summarizeGraph(demo)]} defaultGraphId="demo_classify_and_route" onSubmit={() => undefined} onCancel={() => undefined} />
        </AgentGraphProvider>
      </StrictMode>,
    );

    expect(await screen.findByText(/Changing this node reaches/)).toBeTruthy();
    expect(await screen.findByRole("textbox", { name: "Input question" })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId(/^policy-rule-/)).toHaveLength(2));
    await waitFor(() => expect(requests).toContain("GET /api/graphs/demo_classify_and_route/policy-exceptions"));

    const counts = requests.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
    expect(counts).toEqual({
      "POST /api/graphs/demo_classify_and_route/nodes/router_1/impact": 1,
      // Summaries (one catalog read server-side), never the full graph list.
      "GET /api/graph-summaries": 1,
      // SubgraphConfig and ChatRunPicker share one releases request.
      "GET /api/graphs/demo_classify_and_route/releases": 1,
      "GET /api/graphs/demo_classify_and_route/policies/effective": 1,
      "GET /api/policies/effective": 1,
      "GET /api/graphs/demo_classify_and_route/policies": 1,
      "GET /api/graphs/demo_classify_and_route/policy-exceptions": 1,
    });
  });
});
