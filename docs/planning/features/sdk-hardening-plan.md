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

### Phase 4 — Run lifecycle and universal streaming (SDK 2/7, **High**)

Linear STO-615 · GitHub #66. Non-breaking. It is sequenced second because Studio already works around these gaps.

- **`runs.stream(runId, { signal })`:** an async iterator of validated `PlatformEvent`s. It uses `fetch` with a streaming body, so it works in browsers, Node 18+ and edge runtimes. It reconnects with `Last-Event-ID`; the backend emits event ids for this.
- **`runs.start(...).wait({ timeoutMs, signal, onEvent })`:** absorbs Studio's `watchRun.ts`.
- **Result helpers:** `stepsFromTraces`, `applyRunEvent` and `formatStepDuration` move out of Studio's `chatRuns.ts`.
- **Compatibility:** `streamRunEvents` stays as a deprecated wrapper.

### Phase 3 — Types generated from OpenAPI, plus a drift check (SDK 3/7, Medium)

Linear STO-616 · GitHub #67. Internal only.

- **Generation:** generate types or Zod from `/openapi.json` (openapi-typescript or orval) into `src/generated/`. Hand-written Zod stays only where it adds behaviour (the SSE event union and the graph helpers).
- **Drift check:** CI regenerates the output and fails on any diff.
- **Versioning:** the server sends an `X-AGB-API-Version` header, and the client warns when the server is ahead.

### Phase 2 — Namespaced API, request objects and pagination (SDK 4/7, Medium)

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

### Phase 5a — `/graph` core and `/testing` kit (SDK 5/7, Medium)

Linear STO-620 · GitHub #69. Non-breaking.

- **`/graph` (pure):**
  - immutable edits: `addNode`, `connect`, `removeNode`, `setConfig`, `relabel`;
  - traversal: upstream, downstream and reachability;
  - node search, `runInputVariables` and node labels;
  - the counterfactual and policy helpers;
  - a fast local structural validation that mirrors the backend's cheap checks.
- **`/testing`:** MSW handlers for every route, plus fixture factories.
- **Consumers:** Studio and the Playground import from `/graph`, and the duplicates in Studio `lib/` are removed.

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
