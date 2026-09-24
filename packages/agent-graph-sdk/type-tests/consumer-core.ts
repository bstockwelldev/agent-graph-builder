// SDK 7/7 (STO-619): a consumer of the core and /graph entry points,
// type-checked by `pnpm run check:types` under moduleResolution node16 with
// Node types and NO DOM lib (a server consumer), and under bundler. It
// imports the package by name, so it resolves through package.json
// `exports` -- the same path a user takes.
import { AgentGraphApiError, createAgentGraphClient, type AgentGraphClient, type GraphDefinition, type Page } from "@bstockwelldev/agent-graph-sdk";
import { addNode, connect, validateStructure } from "@bstockwelldev/agent-graph-sdk/graph";

const client: AgentGraphClient = createAgentGraphClient({ baseUrl: "http://localhost:8000", headers: async () => ({ Authorization: "Bearer t" }), timeoutMs: 5_000 });

export async function flow(): Promise<string> {
  const graph: GraphDefinition = await client.graphs.get("demo");
  const page: Page<GraphDefinition> = await client.graphs.listPage({ limit: 10 });
  const handle = await client.runs.start({ graphId: graph.id, input: { question: "q" } });
  for await (const event of handle.stream()) event.event_type satisfies string;
  const settled = await handle.wait({ timeoutMs: 1_000 });
  try {
    await client.releases.publish(graph.id, { notes: "n" });
  } catch (error) {
    if (error instanceof AgentGraphApiError) return String(error.diagnostics?.length ?? page.nextCursor);
  }
  return settled.status;
}

export function edit(): number {
  const next = connect(addNode(base(), { type: "output", id: "out_2" }), { source: "prompt_1", target: "out_2" });
  return validateStructure(next).length;
}

function base(): GraphDefinition {
  return { id: "g", name: "G", entry_node_id: "prompt_1", nodes: [{ id: "prompt_1", type: "prompt", position: { x: 0, y: 0 }, config: {} }], edges: [] };
}
