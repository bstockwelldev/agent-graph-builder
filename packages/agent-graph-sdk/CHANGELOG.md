# Changelog — @bstockwelldev/agent-graph-sdk

## Unreleased

### Added
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
