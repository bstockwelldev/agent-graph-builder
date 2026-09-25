# @bstockwelldev/agent-graph-sdk

TypeScript SDK for [Agent Graph Builder](https://github.com/bstockwelldev/agent-graph-builder): a typed, validated API client with resumable run streaming, pure graph helpers, React hooks, and an MSW test kit.

```sh
npm install @bstockwelldev/agent-graph-sdk zod
```

| Entry point | For | Peer dependencies |
| --- | --- | --- |
| `@bstockwelldev/agent-graph-sdk` | The API client, types, schemas and errors | `zod` |
| `@bstockwelldev/agent-graph-sdk/graph` | Pure graph helpers: edits, traversal, local validation | none |
| `@bstockwelldev/agent-graph-sdk/react` | React hooks on TanStack Query | `react` 18+, `@tanstack/react-query` 5 |
| `@bstockwelldev/agent-graph-sdk/testing` | MSW handlers for every route, plus fixture factories | `msw` 2 |

The package is ESM-only and runs anywhere with `fetch`: browsers, Node 18+, Deno, Bun and edge runtimes. The core doesn't need the DOM lib: its types resolve with either `lib: ["DOM"]` or `@types/node`.

## Quick start: browser

```ts
import { createAgentGraphClient } from "@bstockwelldev/agent-graph-sdk";

const client = createAgentGraphClient({ baseUrl: "https://your-agb-host.example" });

const graphs = await client.graphs.list();
const run = await client.runs.start({ graphId: graphs[0].id, input: { question: "How does TCP work?" } });

// Live node-by-node events. The stream resumes after a dropped connection
// (Last-Event-ID) and never repeats an event.
for await (const event of run.stream()) {
  console.log(event.event_type, event.node_id);
}
```

## Quick start: Node / server

```ts
import { AgentGraphApiError, createAgentGraphClient } from "@bstockwelldev/agent-graph-sdk";

const client = createAgentGraphClient({
  baseUrl: process.env.AGB_URL,
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }), // awaited on every request
  timeoutMs: 15_000,
  retry: { retries: 3 }, // GET/HEAD/OPTIONS only: network errors, 408, 429, 5xx
});

const handle = await client.runs.start({ graphId: "support_flow", input: { question } });
const settled = await handle.wait({ timeoutMs: 60_000 }); // stream + polling fallback
if (settled.status === "failed") throw new Error(settled.error ?? "run failed");

try {
  await client.releases.publish("support_flow", { notes: "Tighter routing", author: "ci" });
} catch (error) {
  if (error instanceof AgentGraphApiError && error.status === 422) {
    console.error(error.diagnostics); // typed diagnostics from a blocked publish
  } else throw error;
}
```

## Quick start: React

```tsx
import { createAgentGraphClient } from "@bstockwelldev/agent-graph-sdk";
import { AgentGraphProvider, useGraphs, useRun } from "@bstockwelldev/agent-graph-sdk/react";

const client = createAgentGraphClient({ baseUrl: "/" });

export function App() {
  return (
    <AgentGraphProvider client={client}>
      <GraphList />
    </AgentGraphProvider>
  );
}

function GraphList() {
  const { data: graphs, isPending, error } = useGraphs();
  if (isPending) return <p>Loading…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  return <ul>{graphs.map((graph) => <li key={graph.id}>{graph.name}</li>)}</ul>;
}

function RunView({ runId }: { runId: string }) {
  const { data: run, events } = useRun(runId); // live over runs.stream
  return <p>{run?.status}: {events.length} events</p>;
}
```

Hooks: `useGraphs`, `useGraph`, `useRuns`, `useRun`, `useReleases`, `useGraphHealth`, `useNodeImpact`, `usePolicies`, `useResources(kind)`. Each is one cached query, so components that ask for the same data share a request. For cache control, use `agentGraphKeys` and `useAgentGraphInvalidation()`: call `invalidate.policies()` after a write, for example. Pass your own `queryClient` to the provider to share an existing cache.

## The client

Each area of the API is a namespace. The resource's own ids are positional arguments; everything else goes in one camelCase request object.

| Namespace | Methods |
| --- | --- |
| `graphs` | `list`, `listPage`, `iterate`, `get`, `create`, `update`, `delete`, `validate`, `compile`, `health`, `impact`, `extractSubgraph`, `usedBy`, `simulate` |
| `runs` | `start`, `get`, `list`, `listPage`, `iterate`, `traces`, `snapshot`, `replay`, `resume`, `stream`, `wait` |
| `releases` | `publish`, `list`, `listPage`, `iterate`, `get`, `compile`, `compare`, `compareDraft`, `run`, `simulate` |
| `policies` | `catalog`, `workspace.get/save`, `graph.get/save`, `effective`, `exceptions.list/listPage/iterate/create/update/delete` |
| `routingLab` | `run`, `compare`, `compareRelease` |
| `knowledge` | `get`, `upload`, `delete`, `lineage`, `lineagePage`, `iterateLineage` |
| `analytics` | `dashboard`, `graph`, `nodeHistory` |
| `providers` | `ready`, `credentials`, `models` |
| `runtimeTargets` | `capabilities` |
| `prompts`, `tools`, `mcpServers`, `agents`, `llmProfiles`, `datasets`, `chatSessions` | `list`/`listPage`/`iterate`, `get`, `create`, `update`, `delete`, `usages`. Also `versions.*` on the first five, `datasets.fromRuns`, and `chatSessions.send` |

- **Validated responses:** every response is checked against a Zod schema, and a mismatch rejects with `AgentGraphResponseError`.
- **Typed errors:** `AgentGraphApiError` (with `status`, `detail`, `diagnostics`, `body`), `AgentGraphNetworkError` and `AgentGraphTimeoutError`. `errorText(error)` gives a one-line message for any of them.
- **Per-call options:** `client.with({ signal, timeoutMs, headers, retry })` returns the same client scoped to those options.
- **Pagination:** `list()` returns the whole list. `listPage({ limit, cursor })` returns `{ items, nextCursor }`. `iterate({ pageSize })` walks every page for you:

  ```ts
  for await (const run of client.runs.iterate({ graphId: "support_flow", pageSize: 100 })) {
    // every run, newest first
  }
  ```
- **Version skew:** the server sends `X-AGB-API-Version`. The client warns once, through `onVersionSkew` (which defaults to `console.warn`), when the server is ahead of the API contract this SDK was generated from. The generated OpenAPI types are exported as `ApiPaths`, `ApiComponents` and `ApiOperations`.

## `/graph`

Pure helpers with no network and no DOM. They're safe in any runtime.

```ts
import { addNode, connect, downstream, validateStructure } from "@bstockwelldev/agent-graph-sdk/graph";

let graph = addNode(draft, { type: "llm", id: "llm_2" }); // default config, returns a new graph
graph = connect(graph, { source: "prompt_1", target: "llm_2" });
validateStructure(graph); // the compiler's structural diagnostics, locally
downstream(graph, "prompt_1"); // Set of reachable node ids
```

It also includes:
- `removeNode`, `setConfig` and `relabel`;
- `upstream`, `reachableFrom` and `hasCycle`;
- node labels and summaries, and node search;
- `runInputVariables`;
- the counterfactual-replay and policy helpers.

`validateStructure` covers structure only. Configs, bindings and policies need the server, so use `client.graphs.validate` for those.

## `/testing`

An in-memory mock of the whole API as [MSW](https://mswjs.io) handlers. It covers every route, and a test enforces that coverage.

```ts
import { setupServer } from "msw/node";
import { createHandlers, createMockStore, makeGraph } from "@bstockwelldev/agent-graph-sdk/testing";

const store = createMockStore({ graphs: [makeGraph({ id: "g", name: "Mine" })] });
const server = setupServer(...createHandlers({ store }));
beforeAll(() => server.listen());
afterAll(() => server.close());
// Use the real client (or your components) as usual; assert on `store` afterwards.
```

The mock is stateful:
- Runs finish immediately, with a stub trace per node and a replayable SSE stream.
- Releases carry real fingerprints.
- Compile and publish use `validateStructure`.
- Lists page the way the API does.

Fixture factories: `demoGraph`, `makeGraph`, `makeRun`, `makeTrace`, `makeRelease`, `makePolicyCatalog`, `makePolicyException`, `makeDataset`, `makePrompt`, `makeChatSession`, and more.

## Upgrading from 0.x

1.0 removes the flat methods that were deprecated in 0.x. Each maps directly onto a namespace:

| 0.x | 1.0 |
| --- | --- |
| `client.getGraph(id)` / `saveGraph(graph)` | `client.graphs.get(id)` / `graphs.update(graph)` |
| `client.startRun(graphId, input, provider, model)` | `(await client.runs.start({ graphId, input, provider, model })).run` |
| `client.publishRelease(graphId, notes, author)` | `client.releases.publish(graphId, { notes, author })` |
| `client.createPolicyException(graphId, code, expiresAt, nodeId, reason)` | `client.policies.exceptions.create(graphId, { code, expiresAt, nodeId, reason })` |
| `client.getEffectivePolicies(graphId)` | `client.policies.effective({ graphId })` |
| `client.sendChatMessage(id, content, context)` | `client.chatSessions.send(id, { content, context })` |
| `streamRunEvents(baseUrl, runId, onEvent, onClose)` | `for await (const e of client.runs.stream(runId))`, or `client.runs.wait(runId, { onEvent })` |

`zod` is now a peer dependency, so install it alongside the SDK.

## Docs

The full API reference is generated with typedoc: run `pnpm --filter @bstockwelldev/agent-graph-sdk run docs`. Release notes are in [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
