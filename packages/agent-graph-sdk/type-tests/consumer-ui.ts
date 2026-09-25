// SDK 7/7 (STO-619): a consumer of /testing and /react, type-checked under
// node16 and bundler with the DOM lib -- msw and TanStack Query's own types
// need it, as does any app using them.
import { createAgentGraphClient } from "@bstockwelldev/agent-graph-sdk";
import { createHandlers, createMockStore, demoGraph, makeGraph } from "@bstockwelldev/agent-graph-sdk/testing";
import { AgentGraphProvider, agentGraphKeys, useGraphs, useNodeImpact, useRun } from "@bstockwelldev/agent-graph-sdk/react";

export const handlers = createHandlers({ store: createMockStore({ graphs: [demoGraph(), makeGraph()] }) }).length;
export const keys = agentGraphKeys.graph("g");
export const client = createAgentGraphClient();
export function useExample() {
  const graphs = useGraphs();
  const run = useRun(graphs.data?.[0]?.id);
  const impact = useNodeImpact("g", "n", { draft: demoGraph() });
  return [graphs.data?.length, run.events.length, impact.data?.downstream.length, AgentGraphProvider] as const;
}
