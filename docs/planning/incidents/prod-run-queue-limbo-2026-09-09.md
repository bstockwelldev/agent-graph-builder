---
title: Incident RCA + PTR — production Run stuck queued / app unresponsive
date: 2026-09-09
status: p0-implemented
severity: P0 (playground production)
url: https://agent-graph-builder-poc.vercel.app
deployment: dpl_GWqVbGjD32tbMSrvZuRpkGEZwsfe (commit 195e917)
---

# RCA + PTR — production Run queue limbo

**Symptom:** After tapping **Run** on the Vercel playground, the UI stays on **queued** / **running**, the event log stays empty, history stays empty or stale, and the shell feels frozen.

**Outcome of this doc:** Root cause, evidence, and a phased resolution plan. P0 A–C implemented on `feat/p0-vercel-run-await` after operator **implement P0**.

---

## 1. Situated problem

The playground was deployed as a **single Vercel Python serverless function** wrapping FastAPI (`backend.app.main:app`). The runtime was designed for a **long-lived Docker process**: in-memory run store, `asyncio.Queue` SSE buses, and `asyncio.create_task` fire-and-forget execution.

On production that contract is false. A Run request returns `status: "queued"` immediately; completion is supposed to arrive on a **second** HTTP connection (`GET /api/runs/{id}/events`). The UI treats `queued | running` as a blocking busy state and **never polls**. Live validation also fires `POST /api/graphs/validate` on every `nodes`/`edges` change, saturating the same function.

**Actors:** mobile/desktop browser, FastAPI serverless instance(s), SQLite at `/tmp/graphs.db`, in-memory `RUN_STORE` / `RUN_BUSES`.

---

## 2. Evidence

| Probe | Result |
| ----- | ------ |
| `GET /` and `GET /api/graphs` | 200 — SPA and demo graph load |
| `POST /api/runs` (stub) | 200, **`status: "queued"`**, `completed_at: null` |
| `GET /api/runs/{id}` ~2s later (warm instance) | 200, **`status: "succeeded"`** — execution *can* finish in-process |
| `GET /api/graphs/{id}/runs` immediately after first run | **`[]`** — snapshot not visible across instances / `/tmp` DBs |
| Same list after a later request | Sometimes 1–2 rows — **instance-local SQLite** |
| Vercel logs (~6h, production) | **Doisens of `POST /api/graphs/validate`**, many `responseStatusCode: 0` (cancelled / never finished) |
| Live validate effect | `App.tsx` 400ms debounce on **`nodes` / `edges` object identity** |
| Diagnostics paint | `applyDiagnosticsToCanvas` → `setNodes` whenever `diagnostics` changes → retriggers validate |
| SSE client | `EventSource` `onerror` **closes the stream** and does not poll; `handleRun` does not pass `onClose` |

CLI reproduction on a warm function can succeed (same instance serves POST + GET + SSE). Browser/mobile Run fails the **cross-request** contract and/or starves behind the validate flood.

---

## 3. Root causes (ranked)

### RC1 — Fire-and-forget execution is invalid on serverless (primary)

`runtime.start_run` schedules `_execute` with `asyncio.create_task` and returns. Vercel freezes or recycles the isolate when the HTTP handler returns. The background task may never run, or it runs only on isolate A.

SSE `GET /api/runs/{id}/events` and later `GET /api/runs/{id}` often hit isolate B:

- bus missing → **404** `"run not found (or its event stream already closed)"`
- `EventSource.onerror` closes; UI stays **`queued`**

This matches README’s own warning: live SSE is in-memory only.

### RC2 — UI has no completion path except SSE

`RunPanel` `running = status === "queued" || status === "running"`. `handleRun` sets summary from the POST body (`queued`) and only updates to succeeded/failed on `run.completed` / `run.failed` SSE events. No timeout, no poll, no treat-404-as-failed.

**Queue limbo** is this UI state, not a durable job queue.

### RC3 — Live-validate feedback loop saturates Hobby concurrency

`useEffect([nodes, edges, …])` → validate → `setDiagnostics` → `applyDiagnosticsToCanvas` → `setNodes` → validate again. Canvas layout (`setNodes` in `FlowCanvas`) also changes `nodes`. Production logs show a validate storm; competing Run/SSE invocations queue or abort (`status 0`).

### RC4 — `/tmp` SQLite is not a shared store

`GRAPH_DB_PATH=/tmp/graphs.db` is per-instance. Completed snapshots do not reliably appear in Run history. Graphs can also disappear after cold start until `bootstrap()` reseeds the demo graph.

### RC5 (contributing) — SSE over Vercel proxies

Even on one instance, EventSource + proxy buffering can delay or drop `text/event-stream`. Not required to explain limbo if RC1+RC2 hold.

---

## 4. Causal chain

```text
User taps Run
  → POST /api/runs returns queued (create_task, no await)
  → UI locks on queued (Run disabled)
  → EventSource GET /events
       ├─ other isolate / bus gone → 404 → onerror close → STUCK
       └─ same isolate but validate storm → timeout / hang → STUCK
  → even if _execute finished, history GET may hit empty /tmp DB
```

---

## 5. PTR — resolution plan

### Goal

A stub (and later keyed) Run on production **always reaches a terminal UI state** within one request or a short poll, without depending on in-memory buses across isolates.

### Non-goals (v1)

- Durable multi-tenant DB / LangGraph checkpoints
- True streaming on Vercel Hobby
- Workspace rename (`agent-graph-builder` / `@bstockwelldev/agent-graph-sdk`) — separate track

### Strategy

**P0 (hotfix, same origin):** make Run **synchronous on Vercel** and make the UI **timeout + poll**. Break the validate loop so the function is not drowned.

**P1:** optional NDJSON in the POST body for event log; still no cross-instance SSE.

**P2:** durable store (Turso / Postgres / KV) if history must survive cold starts. Ask first before new vendors.

---

### Phase A — P0 backend: await execution on Vercel

**Change:** If `os.environ.get("VERCEL")`, `start_run` / `POST /api/runs` **awaits `_execute`** and returns the terminal `RunSummary` (`succeeded` | `failed`). Do not `create_task` on Vercel.

**Keep** `create_task` for local Docker so SSE still streams in `dev up`.

**SSE endpoint:** If bus missing, return **200 + empty stream that immediately closes**, or **409 with JSON** `{ "reason": "no_live_bus", "hint": "poll GET /api/runs/{id}" }` — not a raw 404 that looks like “run never existed”.

**AC:**

- `POST /api/runs` with stub on production returns `succeeded` or `failed`, never `queued`
- Local Docker still returns `queued` then SSE events

---

### Phase B — P0 frontend: never leave queued forever

**Change:**

1. After `startRun`, if `summary.status` is already terminal, skip EventSource; load traces + history.
2. If still `queued`/`running`, open SSE **and** poll `GET /api/runs/{id}` every 1s for ≤30s.
3. `EventSource.onerror`: poll once; if 404, set UI **failed** with “live stream unavailable (serverless); poll failed”.
4. Timeout → `failed` / `timed_out` copy; re-enable Run.

**AC:**

- Run button re-enables after success, failure, or 30s timeout
- Event log empty is allowed if POST already returned the result block

---

### Phase C — P0 validate storm

**Change:**

1. Debounce live validate on a **fingerprint** of graph semantics (node ids/types/config + edges), **not** React Flow position/`style`/`data.status`.
2. `applyDiagnosticsToCanvas` no-ops if issue maps are unchanged (ref compare).
3. Pause live validate while `running` / `compiling`.
4. Abort in-flight validate on next tick (`AbortController`).

**AC:**

- Production logs: validate rate ≪ 1 req/s while idle after layout
- Run is not stuck behind validate `status 0`

---

### Phase D — P1 event log without SSE

Optional: `POST /api/runs` response includes `events: PlatformEvent[]` collected during awaited `_execute`. UI hydrates the event log from the JSON body.

---

### Phase E — P2 persistence (Ask First)

Only if history must survive cold start: replace `/tmp` SQLite with a hosted store. Until then, document “history is ephemeral on Vercel”.

---

## 6. Clarifying questions (S5) / defaults (S6)

| # | Question | Default if silent |
| - | -------- | ----------------- |
| 1 | Hotfix on current Vercel project before workspace rename? | **Yes** — ship P0 A–C to `agent-graph-builder-poc.vercel.app` |
| 2 | Keep Docker SSE streaming locally? | **Yes** — branch on `VERCEL` |
| 3 | Add Turso/Postgres now? | **No** — ephemeral `/tmp` until P2 |
| 4 | Stub-only P0, or also Groq/Gemini? | **All providers** — await still required; keys optional |

---

## 7. Key code paths

Updated after workspace rename (`bda1eac`): playground lives in `apps/playground`; SSE client is in the SDK.

| Path | Role |
| ---- | ---- |
| `backend/app/runtime.py` | `create_task(_execute)`; in-memory `RUN_*` |
| `backend/app/events.py` | per-process `asyncio.Queue` bus |
| `backend/app/main.py` | `POST /api/runs`, SSE, Vercel SPA (`apps/playground/dist`) |
| `backend/app/storage.py` | SQLite snapshots |
| `vercel.json` | `GRAPH_DB_PATH=/tmp/graphs.db`, `maxDuration: 60` |
| `packages/agent-graph-sdk/src/client.ts` | `streamRunEvents` EventSource `onerror` closes |
| `apps/playground/src/api.ts` | thin wrapper over SDK client + stream |
| `apps/playground/src/App.tsx` | live validate effect; `handleRun` SSE-only completion |
| `apps/playground/src/components/RunPanel.tsx` | `queued \| running` disables Run |

**Production URL after rename:** still [https://agent-graph-builder-poc.vercel.app](https://agent-graph-builder-poc.vercel.app) (project `agent-graph-builder`; shorter alias blocked).

---

## 8. Verification

| Check | Pass |
| ----- | ---- |
| `npm run build` | SDK + playground (`build:sdk` / `build:playground`) |
| `uv run pytest -q` from `backend/` | existing 53 + new test: Vercel-mode await returns terminal status (mock env) |
| Manual: production stub Run | terminal status + Run enabled; no validate flood in Vercel logs |
| Manual: local Docker Run | SSE event log still streams |

---

## 9. Next step

Operator: accept S6 (or edit) then say **implement P0** (phases A–C). Rename-to-workspace work stays parked until this hotfix is on production.
