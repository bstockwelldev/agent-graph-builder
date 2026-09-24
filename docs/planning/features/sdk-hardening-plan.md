# SDK hardening & feature-complete plan

**Package:** `@bstockwelldev/agent-graph-sdk` (`packages/agent-graph-sdk`)

**Tracking:**
- Linear: epic [STO-613](https://linear.app/stockwise-productions-prototypes/issue/STO-613)
- GitHub: epic [#64](https://github.com/bstockwelldev/agent-graph-builder/issues/64)

**Status:** planned 2026-09-24.

## Context

The SDK is about 1.7k lines of source. It has three parts:
- **API client:** `client.ts`, about 65 methods, all going through one `jsonFetch`.
- **Schemas:** hand-written Zod schemas and types (`schemas.ts`, `types.ts`) that mirror the backend's Pydantic models.
- **Graph helpers:** a handful of small helpers (fingerprints, edge lookups, bindings).

Every response is validated at runtime, which is a solid base.

## Gaps

| Area | Current state | Consequence |
| --- | --- | --- |
| Transport | `jsonFetch` hard-codes the global `fetch`. There is no way to set headers, auth, a timeout or an `AbortSignal`. A caller's `init.headers` replaces the JSON `Content-Type` instead of merging with it. There are no retries. | The SDK is unusable against an authenticated API, from a server, or in tests without patching globals. Requests can't be cancelled on unmount. |
| Errors | `throw new Error("POST … failed (422): {json}")`. Studio's `errorDetail()` parses the JSON back out of the message. | Structured 422 `diagnostics` (publish, replay or simulate blocked) are only reachable through string parsing. |
| API shape | A flat object of about 65 methods, mixed with namespaced resource clients. Arguments are positional (`createPolicyException(graphId, code, expiresAt, nodeId?, reason?)`). Path segments are unencoded. | Methods are hard to discover and error-prone to call, and new optional arguments are breaking changes. |
| Schema sync | Every Pydantic model is copied by hand into Zod. `contract/node-bindings.json` is the only generated contract. | Drift is inevitable, and FastAPI's `/openapi.json` goes unused. |
| Streaming | `streamRunEvents` uses `EventSource`, so it works in the browser only. It closes on the first error, doesn't reconnect, and doesn't validate events. The "wait for a terminal status" logic lives in Studio's `lib/watchRun.ts`. | Every consumer has to rebuild the most common flow. |
| Reuse | Pure graph logic lives in Studio: `graphSearch`, `graphFocus`, `counterfactual`, `policies`, `runInputs` and `nodeDefaults`. | The Playground or a CLI would have to duplicate it. |
| UI layer | Panels each use the same `useEffect` + `cancelled` load pattern, with no cache. | Duplicate fetches, stale data and boilerplate. |
| Packaging | No README, changelog or release tooling. Version 0.1.0. `zod` is a regular dependency. `lib: DOM` is baked in. There is a single entry point. | Not publishable. Risk of two copies of Zod. Unclear whether it works outside the browser. |

## Phases

### Phase 1 — Transport and typed errors (SDK 1/7, **High**) — **Shipped**

Linear STO-614 · GitHub #65. Non-breaking. As-built notes follow the original scope below.

- **Client options:** `createAgentGraphClient({ baseUrl, fetch?, headers? | getHeaders?(), timeoutMs?, retry?, onRequest?, onResponse? })`.
- **`AgentGraphApiError`:** `status`, `method`, `path`, a typed `detail`, and `diagnostics` for 422 blocked payloads.
- **Per-call options:** `{ signal }` on every call, plus a timeout (`AbortSignal.any`).
- **Correct requests:**
  - merge headers instead of replacing them;
  - send `Content-Type` only when there is a body;
  - `encodeURIComponent` every path segment.
- **Retries:** GET retries with backoff and jitter on network errors, 5xx and 429. Non-GET requests never retry by default.
- **Studio:** `errorDetail()` is replaced by `AgentGraphApiError`.

#### As built

**Transport** (`src/transport.ts`)
- `createAgentGraphClient({ baseUrl, fetch, headers, timeoutMs, retry, onRequest, onResponse })`. `headers` can be a value or a function; a function is awaited on every request, which suits auth tokens.
- Headers are merged in this order: client, then scoped, then per call.
- A JSON `Content-Type` is added only for string bodies. Callers no longer need the old `headers: {}` workaround to send `FormData`.
- **Retries:**
  - apply to GET, HEAD and OPTIONS only;
  - trigger on network errors, 408, 429 and 5xx;
  - use full-jitter exponential backoff and honour `Retry-After`;
  - are never attempted after an abort.
- Every interpolated path segment in `client.ts` is `encodeURIComponent`-ed. The `apiPath` / `apiQuery` helpers are exported.

**Errors** (`src/errors.ts`)
| Class | When |
| --- | --- |
| `AgentGraphError` | Base class for the rest. |
| `AgentGraphApiError` | A non-2xx response. Carries `status`, `method`, `path`, `url`, `detail`, `diagnostics` and `body`. |
| `AgentGraphResponseError` | The response didn't match its schema. |
| `AgentGraphNetworkError` | The request failed before any response. |
| `AgentGraphTimeoutError` | The request exceeded its timeout. |

`errorText(e)` and `isAgentGraphApiError(e)` are exported too.

**Decision: `client.with({ signal, timeoutMs, headers, retry })`, not a trailing option on every call**
- `with` returns the same client, scoped to those options. This keeps the change non-breaking without touching about 65 positional signatures.
- Keyword arguments are part of SDK 4/7.
- `validateGraph(graph, { signal })` still works.

**Studio**
- `lib/apiErrors.ts` `errorDetail` / `blockingDiagnostics` replace the JSON-from-message parsing. `lib/knowledgePanel.ts` re-exports `errorDetail`, so existing imports keep working.
- The Releases panel lists blocked-publish diagnostics individually, for example `RELEASE_SUBGRAPH_UNPUBLISHED`.
- The RunPanel (simulate and replay), Routing lab and Releases panels show the backend's detail instead of raw JSON.
- Adopting `client.with({ signal })` in panel loaders is left to `/react` in SDK 6/7.

**Verification**
- SDK: vitest 129/129, with 12 new tests in `transport.test.ts`.
- Studio: vitest 310/310, including `apiErrors.test.ts`.
- Backend: pytest 515/515.
- Root build: green.
- Playwright smoke:
  - a blocked publish shows "Publish blocked by 1 issue" and lists the `RELEASE_SUBGRAPH_UNPUBLISHED` diagnostic;
  - the extract dialog shows its 422 reason;
  - with the backend down, the graph shows "failed to load" after about 2 s, including retries, and doesn't hang.

### Phase 4 — Run lifecycle and universal streaming (SDK 2/7, **High**) — **Shipped**

Linear STO-615 · GitHub #66. Non-breaking. It is sequenced second because Studio already works around these gaps.

- **`runs.stream(runId, { signal })`:** an async iterator of validated `PlatformEvent`s. It uses `fetch` with a streaming body, so it works in browsers, Node 18+ and edge runtimes. It reconnects with `Last-Event-ID`; the backend emits event ids for this.
- **`runs.start(...).wait({ timeoutMs, signal, onEvent })`:** absorbs Studio's `watchRun.ts`.
- **Result helpers:** `stepsFromTraces`, `applyRunEvent` and `formatStepDuration` move out of Studio's `chatRuns.ts`.
- **Compatibility:** `streamRunEvents` stays as a deprecated wrapper.

#### As built

**Backend**
- `RunEventBus` is now a broadcast log instead of a single-consumer queue. Every subscriber sees every event, and `stream(after=n)` replays whatever a subscriber missed.
- A resumed run's new bus continues the sequence numbering, so it keeps climbing across a pause and resume.
- `GET /api/runs/{id}/events`:
  - sends `retry: 1000` and an `id: <sequence>` on every frame;
  - honours `Last-Event-ID`, or `?after=`;
  - with no live bus (a different serverless isolate), replays the run's persisted events and then closes.

**SDK**
- `runs.ts`:
  - `parseSse` parses a `ReadableStream` body, so it works in browsers, Node 18+ and edge runtimes;
  - `streamRun` validates events, reconnects with `Last-Event-ID`, skips duplicates by sequence, ends on `run.completed`, `run.failed` or `run.paused`, and ends quietly when the server has no live bus;
  - `waitForRun` combines the stream with polling and a timeout.
- **Client API:** `client.runs.stream`, `client.runs.wait`, and `client.runs.start(request)`, which returns a handle with `.wait()` and `.stream()`.
- `transport.open` returns the raw response for streaming.
- `runSteps.ts`: `applyRunEvent`, `stepsFromTraces` and `formatStepDuration` moved here from Studio.
- `streamRunEvents` is deprecated and now wraps `streamRun`, so existing callers get reconnection and no longer depend on `EventSource`.

**Decision: `wait()` treats `paused` as settled, alongside `succeeded` and `failed`**
- A run paused at a human gate won't make progress without a resume. Studio previously let such a run time out after 30 s with a "stream unavailable" message; it now shows the paused state.

**Studio**
- `watchRunCompletion` is now a thin adapter over `client.runs.wait`. It maps a timeout or a 404 to a failed run summary with a readable reason.
- The Run panel (GraphEditor) and chat run cards use it through `waitForRun`.
- `lib/chatRuns.ts` re-exports the step helpers, so existing imports keep working.

**Verification**
- **Tests:**
  - Backend pytest 519/519, including `test_run_event_stream.py`: broadcast, `after`, sequence continuity across a resume, SSE ids with `Last-Event-ID` and `?after=`, and persisted replay.
  - SDK vitest 138 passed, plus 1 live end-to-end test that is skipped unless `AGB_E2E_URL` is set. The suite covers the parser, reconnecting without losing or duplicating events, the no-live-bus case, malformed events, the reconnect limit, `wait` via stream and via polling, and timeout and abort.
  - Studio vitest 314/314, including `watchRun.test.ts`.
- **Live end to end:** run in Node against a stub backend. It runs the demo graph, streams it to completion, and resumes the stream from `lastEventId: 2`.
- **Playwright:**
  - The Run panel settled in about 1 s over the fetch stream, with a single `/events` request and 16 events.
  - A chat `/run` card reached "Succeeded · 7 of 7 nodes done".

### Phase 3 — Types generated from OpenAPI, plus a drift check (SDK 3/7, Medium) — **Shipped**

Linear STO-616 · GitHub #67. Internal only.

- **Generation:** generate types or Zod from `/openapi.json` (openapi-typescript or orval) into `src/generated/`. Hand-written Zod stays only where it adds behaviour (the SSE event union and the graph helpers).
- **Drift check:** CI regenerates the output and fails on any diff.
- **Versioning:** the server sends an `X-AGB-API-Version` header, and the client warns when the server is ahead.

#### As built

**Contract**
- `backend/app/api_contract.py` defines `API_VERSION` (0.3.0) and writes FastAPI's OpenAPI document deterministically, with sorted keys.
- `uv run python -m scripts.export_openapi [--check]` exports it to `packages/agent-graph-sdk/contract/openapi.json` (81 schemas), following the existing `node-bindings.json` pattern.
- Every response carries `X-AGB-API-Version`. CORS exposes the header so browser clients can read it.

**Generated types**
- `pnpm --filter @bstockwelldev/agent-graph-sdk run generate [--check]` runs `scripts/generate.mjs`, which uses openapi-typescript 7 to produce `src/generated/openapi.ts` along with `CONTRACT_API_VERSION`.
- The generated types are exported as `ApiPaths`, `ApiComponents` and `ApiOperations`.
- Generation uses `defaultNonNullable: false`, so a field that has a server default is optional to send.

**Drift checks (both run in CI)**
1. Backend pytest `test_openapi_contract.py` fails when `openapi.json` is stale.
2. SDK vitest `contract.test.ts` fails in either of these cases:
   - the generated types are stale;
   - a hand-written response schema lacks a field of its contract model, or has a field the model doesn't. Schemas are matched to models by name, with an alias map.
3. The same test fails when a new hand-written object schema has no contract model, unless it's explicitly listed in `UNTYPED_ON_BACKEND`. That list covers 20 schemas whose routes return untyped dicts.

Both checks were verified by adding a field to a Pydantic model without regenerating: pytest and vitest each failed, and vitest named the missing field.

**Decision: keep the hand-written Zod response schemas**
- They are the SDK's runtime validation, since every response is parsed. openapi-typescript generates types only, not Zod.
- The duplication is now checked against the contract, so the schemas can't drift silently.
- Pure duplicates were removed: the `replayRequestSchema` and `modelOverrideSchema` request bodies are now typed from the generated contract.
- Generating the Zod schemas themselves, for example with an openapi-to-zod generator, can be revisited alongside SDK 4/7's request objects.

**Version skew**
- The client compares the server's major.minor version with `CONTRACT_API_VERSION`.
- If the server is ahead, `onVersionSkew` is called once per client. It defaults to `console.warn`, and `false` silences it.
- `RunSummary.compiler_version` was already exposed.

**Verification**
- Backend pytest: 528/528.
- SDK vitest: 143, plus 1 end-to-end test that runs only when `AGB_E2E_URL` is set. The contract, drift, coverage and skew tests are included.
- Studio vitest: 314/314.
- Root build, with `pnpm install --frozen-lockfile`: green.

### Phase 2 — Namespaced API, request objects and pagination (SDK 4/7, Medium) — **Shipped**

Linear STO-617 · GitHub #68. Old names stay as deprecated aliases for one minor version.

- **Namespaces:**

  | Namespace | Methods |
  | --- | --- |
  | `graphs` | `list`, `get`, `create`, `update`, `validate`, `compile`, `health`, `impact` |
  | `runs` | `start`, `get`, `list`, `traces`, `replay`, `resume`, `stream`, `wait` |
  | `releases` | `publish`, `list`, `get`, `compare`, `compareDraft`, `run`, `simulate` |
  | `policies` | `catalog`, `workspace`, `graph`, `effective`, `exceptions.*` |
  | `routingLab` | `run`, `compare`, `compareRelease` |
  | `knowledge` | — |
  | `analytics` | — |
  | `resources` | the existing kinds |

- **Request objects** replace positional arguments.
- **Pagination:** cursor pagination (`limit` and `cursor`) on list endpoints, in both the backend and the SDK.

#### As built

**Backend pagination (opt-in, non-breaking)**
- `backend/app/pagination.py` adds `?limit=` (1–500) and `?cursor=` to every list route: graphs, runs (per graph and across graphs), releases, policy exceptions (per graph and across the workspace), knowledge lineage, every resource kind, and resource versions.
- Without either parameter, a route returns exactly what it did before. With them, it returns one page in a documented order and sets `X-Next-Cursor` while more items remain. CORS exposes the header.
- The body stays a plain array, so no response schema changed and older clients are unaffected. `API_VERSION` is now 0.4.0 (an additive change).
- A cursor is the base64url sort key of the last item, and the next page is every item strictly after it. Deleting an item between pages never shifts or repeats the rest. A malformed cursor returns 400.
- Page order:
  - graphs and resources: by id;
  - runs: newest first;
  - releases, versions, exceptions and lineage: by creation time.
- Paged runs are uncapped. Unpaged runs keep the old caps of 50 per graph and 200 across graphs. Storage `list_runs_for_graph` / `list_all_runs` now accept `limit=None`.
- The remote stores still list and then filter. Keyset queries on the backend can come later.

**SDK namespaces** (`src/api.ts`)
- Namespaces: `graphs`, `runs`, `releases`, `policies` (`catalog`, `workspace.get/save`, `graph.get/save`, `effective`, `exceptions.*`), `routingLab`, `knowledge`, `analytics` (`dashboard`, `graph`, `nodeHistory`), `providers`, `runtimeTargets`, and the resource kinds.
- The resource kinds (`prompts`, `tools`, `mcpServers`, `agents`, `llmProfiles`, `datasets`, `chatSessions`) stay top-level. They were already namespaces, so a `client.resources` wrapper would only add a second path to the same thing. `datasets.fromRuns` and `chatSessions.send` absorb the last two flat bespoke methods.
- Convention: the resource's own ids are positional, and everything else is one camelCase request object that the SDK maps to snake_case. Examples:
  - `releases.publish(graphId, { notes, author })`
  - `policies.exceptions.create(graphId, { code, expiresAt, nodeId, reason })`
  - `graphs.impact(graphId, { nodeId, draft })`
- `runs.start` and `releases.run` return a `RunHandle` (`.run`, `.wait()`, `.stream()`).
- Every list offers three readers:
  - `list()`: unpaged, as before;
  - `listPage({ limit, cursor })`: returns `{ items, nextCursor }`;
  - `iterate({ pageSize })`: an async generator over every item.
- Knowledge lineage uses `lineage`, `lineagePage` and `iterateLineage`. `collectAll()` gathers an iterator into an array.
- Transport gains `requestWithHeaders`, which pagination uses to read `X-Next-Cursor`.

**Deprecated aliases**
- Every flat method (`getGraph`, `startRun`, `createPolicyException`, ...) keeps its positional signature, delegates to its namespace, and is tagged `@deprecated` in TSDoc with the replacement named.
- The existing client tests pass unchanged against the aliases. A new test checks that each alias sends exactly the request its namespaced method sends.
- Deprecated aliases stay for one minor version; they are removed at 1.0 (SDK 7/7).

**Studio**
- Every call site and every test mock uses the namespaces.
- `lib/api-client.ts` types `client` as `Omit<AgentGraphClient, keyof DeprecatedClientMethods>`, so `tsc` rejects any use of a deprecated alias.
- `lib/mockClient.ts` resets nested test mocks.

**Verification**
- Backend pytest: 539/539. `test_pagination.py` pages through 130 graphs, 120 runs (past the unpaged cap) and 105 resources, checks that a deleted cursor item doesn't shift the next page, and checks bounds, the invalid-cursor response, CORS exposure, and every other paged route.
- SDK vitest: 150, plus the end-to-end test.
  - `namespaces.test.ts` iterates 250 items across pages, and checks `listPage`, per-route paging, request-object bodies, alias/namespace parity, and `with()` scoping.
  - The end-to-end test also passed live against the stub backend.
- A live check through the built SDK iterated 121 graphs in pages of 50, with none missing or repeated.
- Studio: vitest 314/314, tsc clean, eslint 0 errors.
- Root build: green.
- Playwright on the stub backend, at 1440 and 390 widths, with no failed API calls: graph list, publishing a release, a chat `/run` to Succeeded, and the policies page.

### Phase 5a — `/graph` core and `/testing` kit (SDK 5/7, Medium) — **Shipped**

Linear STO-620 · GitHub #69. Non-breaking.

- **`/graph` (pure):**
  - immutable edits: `addNode`, `connect`, `removeNode`, `setConfig`, `relabel`;
  - traversal: upstream, downstream and reachability;
  - node search, `runInputVariables` and node labels;
  - the counterfactual and policy helpers;
  - a fast local structural validation that mirrors the backend's cheap checks.
- **`/testing`:** MSW handlers for every route, plus fixture factories.
- **Consumers:** Studio and the Playground import from `/graph`, and the duplicates in Studio `lib/` are removed.

#### As built

**`@bstockwelldev/agent-graph-sdk/graph`** (`src/graph/`)
- The entry point is pure: its built output imports nothing outside itself. There's no network, DOM or Zod runtime.
- Immutable edits (`edit.ts`):
  - `addNode` (default config for the type, id `<type>_<n>`), `connect`, `removeNode` (also removes the node's edges and group memberships), `setConfig` (merge or `{ replace }`; a key set to `undefined` is removed), `relabel`, and `nextId`.
  - Every edit returns a new graph and leaves its input untouched. It throws on an unknown node or a duplicate id.
- Traversal (`traverse.ts`): `upstream`, `downstream`, `reachableFrom` (the compiler's entry-node reachability), `hasCycle`, and Studio's `computeFocusNodeIds`.
- Local validation (`validate.ts`): `validateStructure` mirrors the compiler's cheap checks. It uses the same 17 codes (`STRUCTURAL_CODES`), severities, node and edge ids, messages and ordering:
  - duplicate node and edge ids;
  - a missing entry node;
  - edges to unknown nodes;
  - a conditional edge without a condition;
  - unreachable nodes and cycles;
  - router/branch outgoing-edge rules;
  - group and layer checks.
  Config, binding, port, subgraph and policy checks need the server's registries, so `client.graphs.validate` stays the authority.
- Moved from Studio `lib/`: `nodes.ts` (was `nodeDefaults`), `search.ts` (was `graphSearch`), `runInputs.ts` (now typed over graph nodes), `counterfactual.ts` and `policies.ts`, together with their tests.

**Shared fixtures**
- `contract/structural-fixtures.json` holds 14 cases, including the demo graph, each with the diagnostics it should produce.
- Backend `tests/test_structural_fixtures.py` and SDK `graph/validate.test.ts` both check every case against this same file, so the two implementations can't drift apart. The backend test also pins the demo case to `build_demo_graph()`.

**`@bstockwelldev/agent-graph-sdk/testing`** (`src/testing/`)
- `msw` v2 is an optional peer dependency. Nothing else in the SDK imports this entry.
- `createHandlers({ store, baseUrl })` returns MSW handlers for all 115 contract routes (method + path), backed by `createMockStore(seed)`, which is in-memory and stateful:
  - Graph, resource and version CRUD work like the real API, and list routes support the API's `limit`/`cursor` paging with `X-Next-Cursor`.
  - Runs finish immediately: one stub trace per node on the default-route path, plus a replayable SSE event stream.
  - Releases have real fingerprints, and publishing is idempotent.
  - Compile and publish use `validateStructure`, so a structurally broken graph returns a 422 with typed diagnostics.
  - Policies resolve default → workspace → graph. Exceptions, routing-lab reports, knowledge upload and lineage, analytics, providers and chat are also mocked.
- Coverage is enforced: a test compares the handler table with `contract/openapi.json` in both directions, so a new route fails CI until it's mocked.
- Fixture factories: `demoGraph` (pinned to the backend's demo graph), `makeGraph`, `makeRun`, `makeTrace`, `makeRelease`, `releaseIndexEntry`, `makePolicyCatalog`, `makeEffectivePolicy`, `makePolicyException`, `makeDataset`, `makeFixture`, `makeDiagnostic`, `makePrompt`, `makeChatSession`.

**Studio**
- Studio imports these helpers from `/graph`. Seven `lib/` modules are deleted: the five moved ones, `runInputs`, and also `runFromNode`, whose `computeAncestorNodeIds` duplicated `upstream`.
- `subgraphs.childInputs` duplicated `runInputVariables` and is removed.
- `app/graphs/page.mock-api.test.tsx` is a consumer test: it renders the real page with the real client against `/testing`, with no backend and no module mocks.
- The Playground named in this phase was retired in the studio consolidation, so Studio is the only consumer.

**Verification**
- Backend pytest: 554/554, including 15 structural-fixture tests.
- SDK vitest: 219, plus 1 end-to-end test. Includes 58 `/graph` tests and 10 `/testing` tests; the `/testing` tests cover route coverage, factories, and every client namespace method against the mock through MSW.
- Studio: vitest 271/271 (43 tests moved into the SDK with their helpers), tsc clean, eslint 0 errors.
- Root build and `pnpm install --frozen-lockfile`: green.
- Playwright on the stub backend (1440 and 390 widths), with no API or page errors: node cards, find (`type:llm`), the run input field, and the policies page.

### Phase 5b — `/react` hooks (SDK 6/7, Low)

Linear STO-618 · GitHub #70. Non-breaking.

- **Foundation:** built on TanStack Query, with `react` and the query library as peer dependencies.
- **Provider:** `AgentGraphProvider(client)`.
- **Hooks:**
  - `useGraph` / `useGraphs`
  - `useRuns`
  - `useRun`, which is live over `runs.stream`
  - `useReleases`
  - `useGraphHealth`
  - `useNodeImpact`
  - `usePolicies`
  - `useResources(kind)`
- **Cache:** query keys are exported.
- **Studio migration:** panels move over gradually.

### Phase 5c — Docs, packaging and release (SDK 7/7, Low)

Linear STO-619 · GitHub #71.

- **Packaging:**
  - exports `.`, `./graph`, `./react` and `./testing`;
  - `sideEffects: false`;
  - `zod` and `react` as peer dependencies;
  - no DOM lib in the core build.
- **Documentation:** a README with quick-starts for the browser, Node and React; TSDoc; and a typedoc site.
- **Release tooling:** Changesets, an npm publish workflow with provenance, and a bundle-size check in CI.
- **Versions:** 0.2.0 after SDK 1/7–3/7 land. 1.0 once the namespaces are stable and the aliases are removed.

## Sequencing

| PR | Phase | Priority | Breaking? | Linear | GitHub |
| --- | --- | --- | --- | --- | --- |
| SDK 1/7 | Transport and typed errors | High | No | STO-614 | #65 |
| SDK 2/7 | Run lifecycle and streaming | High | No | STO-615 | #66 |
| SDK 3/7 | Types generated from OpenAPI, plus a drift check | Medium | Internal | STO-616 | #67 |
| SDK 4/7 | Namespaces and pagination | Medium | Deprecations | STO-617 | #68 |
| SDK 5/7 | `/graph` and `/testing` | Medium | No | STO-620 | #69 |
| SDK 6/7 | `/react` hooks | Low | No | STO-618 | #70 |
| SDK 7/7 | Docs and release (1.0) | Low | — | STO-619 | #71 |

## Out of scope

- A client-side auth or login flow. The SDK accepts headers or `getHeaders`, and the app owns authentication.
- Offline or optimistic caching beyond what the query library provides.

## Done when

The SDK is published at 1.0 with a README, typedoc and a changelog, and Studio (and the Playground) consume only public SDK entry points.
