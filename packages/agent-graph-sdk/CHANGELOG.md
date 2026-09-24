# Changelog — @bstockwelldev/agent-graph-sdk

## Unreleased

### Added
- **Namespaced API** (SDK 4/7, STO-617): `client.graphs`, `runs`, `releases`, `policies` (`workspace`, `graph`, `exceptions`), `routingLab`, `knowledge`, `analytics`, `providers` and `runtimeTargets`, alongside the resource namespaces.
  - Ids stay positional; everything else is a camelCase request object, e.g. `releases.publish(graphId, { notes, author })`.
  - `runs.start` and `releases.run` return a `RunHandle`.
  - `datasets.fromRuns` and `chatSessions.send` are new.
- **Cursor pagination:** every list has `list()` (unpaged, as before), `listPage({ limit, cursor })` → `{ items, nextCursor }`, and `iterate({ pageSize })`.
  - Knowledge lineage uses `lineagePage` and `iterateLineage`.
  - Also exported: `collectAll`, `NEXT_CURSOR_HEADER`, and the `Page`, `PageRequest` and `IterateRequest` types.
  - Requires API 0.4.0, which adds `?limit=&cursor=` and `X-Next-Cursor`.
- Request types are exported, plus `DeprecatedClientMethods`: `Omit<AgentGraphClient, keyof DeprecatedClientMethods>` is a client type without the aliases.
- `Transport.requestWithHeaders`.

### Deprecated
- Every flat client method (`getGraph`, `startRun`, `publishRelease`, `createPolicyException`, ...). Each still works as an alias of its namespaced method, sends the same request, and names its replacement in TSDoc. The aliases will be removed at 1.0.

- **OpenAPI contract** (SDK 3/7, STO-616): `contract/openapi.json`, exported by the backend.
  - `src/generated/openapi.ts` is generated from it (`pnpm run generate`) and exported as `ApiPaths`, `ApiComponents` and `ApiOperations`, along with `CONTRACT_API_VERSION`.
  - Contract drift tests fail on stale generated types or on a hand-written schema that doesn't match its contract model.
- **Version-skew warning:** when the server's `X-AGB-API-Version` is ahead of the contract, the client calls `onVersionSkew`, once per client. It defaults to `console.warn`; pass `false` to silence it.
- Exported `isServerAhead` and `API_VERSION_HEADER`.

### Changed
- `ReplayRequest` and `ModelOverride` are now typed from the generated contract.
- `replayRequestSchema` and `modelOverrideSchema` are removed. They were request bodies that were never used for validation.

- **Run lifecycle** (SDK 2/7, STO-615):
  - `client.runs.stream(runId)` is an async iterator of validated events. It is built on `fetch`, so it works in browsers, Node 18+ and edge runtimes. It reconnects with `Last-Event-ID`, never loses or repeats an event, and ends when the run settles.
  - `client.runs.wait(runId, { onEvent, timeoutMs, signal })` streams events with a polling fallback, and resolves on `succeeded`, `failed` or `paused`.
  - `client.runs.start(request)` returns a handle with `.wait()` and `.stream()`.
- Exported `parseSse`, `streamRun`, `waitForRun` and `isSettledRun`.
- Run-step helpers `applyRunEvent`, `stepsFromTraces` and `formatStepDuration`, moved here from Studio.

### Deprecated
- `streamRunEvents`: use `client.runs.stream` or `client.runs.wait`. It now wraps the resumable stream instead of `EventSource`.

- **Transport options** (SDK 1/7, STO-614): `createAgentGraphClient({ baseUrl, fetch, headers, timeoutMs, retry, onRequest, onResponse })`.
  - `fetch` is injectable, for servers and tests.
  - `headers` can be a value, or a function that is awaited on every request (for auth).
  - Timeouts are handled per attempt.
- **Retries:** GET, HEAD and OPTIONS requests retry on network errors, 408, 429 and 5xx, with jittered backoff. `Retry-After` is honoured. Other methods never retry by default.
- **Hooks:** `onRequest` and `onResponse` receive the attempt number, status and duration.
- **`client.with({ signal, timeoutMs, headers, retry })`:** returns the same client scoped to per-call options, e.g. cancel on unmount.
- **Typed errors:**
  - `AgentGraphApiError`, which exposes `status`, `detail`, `diagnostics` (from blocked publish, replay, simulate and compile responses) and `body`;
  - `AgentGraphResponseError`, `AgentGraphNetworkError` and `AgentGraphTimeoutError`, all extending `AgentGraphError`;
  - the helpers `isAgentGraphApiError` and `errorText`.
- `apiPath` and `apiQuery` helpers for encoded paths and query strings.

### Changed
- Every path segment is now URL-encoded, so ids containing `/`, spaces or `?` round-trip.
- Headers are merged instead of replaced. `Content-Type: application/json` is sent only with string bodies, so `FormData` uploads get their multipart boundary.
- Failures now reject with the typed errors above instead of a plain `Error`. The message format (`"POST /path failed (422): …"`) is kept, but it now carries the backend's `detail` text rather than raw JSON.

## 0.1.0
- Initial client, schemas and graph helpers.
