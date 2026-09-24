// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { StrictMode, type ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAgentGraphClient } from "../client.js";
import { createHandlers, createMockStore, demoGraph, makePrompt } from "../testing/index.js";
import {
  AgentGraphProvider,
  agentGraphKeys,
  useAgentGraphInvalidation,
  useGraph,
  useGraphHealth,
  useGraphs,
  useGraphSummaries,
  useNodeImpact,
  usePolicies,
  useReleases,
  useResources,
  useRun,
  useRuns,
} from "./index.js";

// SDK 6/7 (STO-618): the /react hooks against the /testing mock API.

const store = createMockStore({ resources: { prompts: [makePrompt()] } });
const server = setupServer(...createHandlers({ store }));
const requests: string[] = [];
server.events.on("request:start", ({ request }) => {
  requests.push(`${request.method} ${new URL(request.url).pathname}`);
});
const client = createAgentGraphClient({ baseUrl: "http://agb.test", onVersionSkew: false });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  requests.length = 0;
});
afterAll(() => server.close());

const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <AgentGraphProvider client={client}>{children}</AgentGraphProvider>
  </StrictMode>
);

describe("/react hooks", () => {
  it("shares one request between components, even under StrictMode", async () => {
    function Names() {
      const graphs = useGraphs();
      return <p>{graphs.data?.map((g) => g.name).join(",") ?? "loading"}</p>;
    }
    render(
      <>
        <Names />
        <Names />
      </>,
      { wrapper },
    );
    expect(await screen.findAllByText("Classify & Route (demo)")).toHaveLength(2);
    expect(requests.filter((r) => r === "GET /api/graphs")).toHaveLength(1);
  });

  it("loads graph summaries from /api/graph-summaries", async () => {
    const { result } = renderHook(() => useGraphSummaries(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((g) => [g.id, g.input_variables])).toEqual([["demo_classify_and_route", ["question"]]]);
    expect(requests).toContain("GET /api/graph-summaries");
    expect(agentGraphKeys.graphSummaries().slice(0, 2)).toEqual(agentGraphKeys.graphs());
  });

  it("loads a graph, its releases, health and a node's impact", async () => {
    await client.releases.publish("demo_classify_and_route");
    const { result } = renderHook(
      () => ({
        graph: useGraph("demo_classify_and_route"),
        idle: useGraph(null),
        releases: useReleases("demo_classify_and_route"),
        health: useGraphHealth("demo_classify_and_route", { draft: demoGraph() }),
        impact: useNodeImpact("demo_classify_and_route", "router_1", { draft: () => demoGraph(), draftKey: "v1" }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.impact.data).toBeDefined());
    await waitFor(() => expect(result.current.health.data && result.current.releases.data && result.current.graph.data).toBeTruthy());
    expect(result.current.graph.data?.id).toBe("demo_classify_and_route");
    expect(result.current.idle.fetchStatus).toBe("idle");
    expect(result.current.releases.data).toHaveLength(1);
    expect(result.current.health.data?.band).toBe("healthy");
    expect(result.current.impact.data?.outputs_reached).toEqual(["output_1"]);
  });

  it("streams a run's events and ends on the settled summary", async () => {
    const { run } = await client.runs.start({ graphId: "demo_classify_and_route", input: { question: "q" } });
    const { result } = renderHook(() => ({ run: useRun(run.run_id), list: useRuns("demo_classify_and_route") }), { wrapper });
    await waitFor(() => expect(result.current.run.events.at(-1)?.event_type).toBe("run.completed"));
    expect(result.current.run.data?.status).toBe("succeeded");
    expect(result.current.run.events.filter((e) => e.event_type === "node.completed")).toHaveLength(7);
    await waitFor(() => expect(result.current.list.data?.some((r) => r.run_id === run.run_id)).toBe(true));
  });

  it("reads policies and resources, and refetches after invalidation", async () => {
    const { result } = renderHook(
      () => ({ policies: usePolicies("demo_classify_and_route"), prompts: useResources("prompts"), invalidate: useAgentGraphInvalidation() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.policies.data && result.current.prompts.data).toBeTruthy());
    expect(result.current.policies.data?.workspace).toHaveLength(2);
    expect(result.current.prompts.data?.map((p) => p.id)).toEqual(["prompt_greeting"]);

    await client.policies.exceptions.create("demo_classify_and_route", { code: "POLICY_LLM_MODEL_NOT_PINNED", expiresAt: "2026-06-01T00:00:00Z" });
    expect(result.current.policies.data?.exceptions).toHaveLength(0);
    await act(() => result.current.invalidate.policies());
    await waitFor(() => expect(result.current.policies.data?.exceptions).toHaveLength(1));
  });

  it("exports stable, nested query keys", () => {
    expect(agentGraphKeys.releases("g")).toEqual(["agent-graph", "graphs", "g", "releases"]);
    expect(agentGraphKeys.impact("g", "n", "k").slice(0, 3)).toEqual(agentGraphKeys.graph("g"));
  });

  it("requires the provider", () => {
    expect(() => renderHook(() => useGraphs())).toThrow(/AgentGraphProvider/);
  });
});
