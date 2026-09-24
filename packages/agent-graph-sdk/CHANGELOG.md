# Changelog — @bstockwelldev/agent-graph-sdk

## Unreleased

### Added
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
