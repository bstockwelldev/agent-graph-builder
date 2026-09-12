---
title: Incident RCA + PTR — Groq run succeeded, follow-up GET 404s
date: 2026-09-10
status: p0-ui-implemented
severity: P0 (playground production — false-positive success + uncaught 404 storm)
url: https://agent-graph-builder-poc.vercel.app
deployment: dpl_Hdf3cTFCADNjJyX6nEdYxhb94sDr (commit 35c1e71)
bundle: /assets/index-BmJ0fxtP.js
---

# RCA + PTR — production run 404 after successful Groq POST

> **Current production URL:** https://agent-graph-builder-app.vercel.app (this incident references legacy alias `agent-graph-builder-poc.vercel.app`).

**Symptom:** User ran a graph with **Groq** selected. The run **looked successful but did nothing** (canvas/inspection empty). Console:

```text
GET /api/runs/run_050c7112940b/nodes → 404 {"detail":"run not found"}
GET /api/runs/run_050c7112940b → 404 {"detail":"run not found"}
Uncaught Error: GET ... failed (404)
(repeated)
Node cannot be found in the current page.
```

**Outcome of this doc:** Root cause, evidence, and PTR. Small P0 UI hardening implemented (stop uncaught 404s; rebuild traces from POST events). Durable store remains an **operator** action: set `OBJECT_STORE_*` (recommended S3/R2/MinIO) or optional `TURSO_*`.

---

## 1. Situated problem

Production is a **single Vercel Python serverless function**. `POST /api/runs` awaits execution in that isolate (`start_run_inline` when `VERCEL` is set), snapshots the completed run to SQLite, and returns `succeeded` with events.

Follow-up `GET /api/runs/{id}` and `GET /api/runs/{id}/nodes` are **separate HTTP requests**. Vercel may route them to a **different isolate**. Without Turso, each isolate has its own `/tmp/graphs.db` and empty in-memory `RUN_STORE`. Isolate B correctly answers **404 run not found**.

The playground then:

1. Fails to load node traces → inspection paints an empty path (all nodes dimmed) → **looks like a no-op**.
2. History click uses `Promise.all(getRun, getRunNodeTraces)` with **no catch** → **uncaught** 404s. Parallel GETs can even split across isolates (one 200, one 404).

**Actors:** browser playground, FastAPI serverless isolates, Groq chat API, file SQLite at `GRAPH_DB_PATH=/tmp/graphs.db`.

---

## 2. Evidence

| Probe | Result |
| ----- | ------ |
| Production alias | `agent-graph-builder-poc.vercel.app` → project `agent-graph-builder` |
| Live HTML | `/assets/index-BmJ0fxtP.js` — **same** as deploy `dpl_Hdf3cTFCADNjJyX6nEdYxhb94sDr` (`35c1e71`). **Not** a stale frontend vs Turso commit. |
| `vercel.json` `CHAT_PROVIDER` | `"stub"` — default only when POST **omits** `provider` |
| Run panel default | `provider = "stub"` until the user picks Groq |
| This incident | User **did** pick Groq (see logs) |
| `16:21:44` UTC | `GET /api/providers/groq/credentials` 200, `GET /api/providers/groq/models` 200, live `GET https://api.groq.com/openai/v1/models` 200 |
| `16:21:47` UTC | `GET /api/providers/groq/ready` 200; **`POST /api/runs` 200** with **`POST https://api.groq.com/openai/v1/chat/completions` 200** |
| `16:21:47–50` UTC | `GET /api/runs/run_050c7112940b` **200** and `/nodes` **200** (isolate that ran POST still warm) |
| `16:23:44–48` UTC | **Mixed 200 and 404** on the **same** `run_id` (isolate roulette; `/tmp` not shared) |
| `16:25:59` UTC | Pair of **200**s again (hit an isolate that still had `/tmp`) |
| Runtime errors table | Empty — 404 is a handled HTTP response, not a function crash |
| `"Node cannot be found in the current page"` | **Not** in playground source. Typical browser-automation / React Flow miss after empty inspection paint. |

### How GET looks up a run

`GET /api/runs/{id}` and `/nodes` call `runtime.get_run_summary` / `get_run_node_traces`:

1. In-memory `RUN_STORE` / `RUN_TRACES` (process-local).
2. Else `storage.get_run` / `get_run_traces` (SQLite, object store, or Turso).

`_persist_run_snapshot` **is** called in `_execute` `finally` after success or failure. GET is **not** RAM-only. The snapshot is durable **only** if the storage backend is shared.

### Why POST 200 then GET 404

| Layer | Shared across isolates? |
| ----- | ----------------------- |
| `RUN_STORE` | No |
| File SQLite `/tmp/graphs.db` | No (`GRAPH_DB_PATH` in `vercel.json`) |
| Shared object store (`OBJECT_STORE_*`) or Turso (`TURSO_*`) | Yes — **not set** at incident time (mixed 200/404 would be impossible if both isolates read the same remote store) |

This is the known P2 from [prod-run-queue-limbo-2026-09-09.md](prod-run-queue-limbo-2026-09-09.md) RC4 and [prod-sqlite-startup-2026-09-10.md](prod-sqlite-startup-2026-09-10.md) §5 P2. Dual backend **code** shipped in `35c1e71`; production still uses isolate-local `/tmp` until the operator sets Turso env vars.

### Did Groq run, or was it stub?

**Groq ran.** Production logs show a live Groq `chat/completions` 200 during `POST /api/runs` for `run_050c7112940b`. `CHAT_PROVIDER=stub` did **not** override the request body (`provider: "groq"`). `GROQ_API_KEY` is present in the serverless environment (ready + models + completions succeeded).

The **false positive** is UX, not a stub swap: POST completed with a real Groq call; follow-up GETs on other isolates 404; empty traces dim the canvas; history `Promise.all` throws uncaught errors. Stub would have returned `[stub answer] …` with **no** `api.groq.com` HTTP line.

---

## 3. Root cause (summary)

**RC1 (primary):** Cross-isolate run lookup against **ephemeral per-isolate SQLite**. POST writes snapshot on isolate A; GET often hits isolate B → 404 even though GET already falls back from `RUN_STORE` to `storage.get_run`.

**RC2 (UX amplifier):** Playground treats 404 as a thrown `jsonFetch` error. History `Promise.all(getRun, getRunNodeTraces)` is uncaught. Parallel requests can split across isolates. Empty traces make a successful Groq run look like a no-op.

**RC3 (operator):** No shared store (`OBJECT_STORE_*` or `TURSO_*`) was set, so each isolate used `/tmp` SQLite. `CHAT_PROVIDER=stub` is a red herring **when the UI sends `provider=groq`**.

---

## 4. Causal chain

```text
User selects Groq → providerReady/credentials/models (live Groq API)
  → POST /api/runs (VERCEL) start_run_inline
  → Groq chat/completions 200 → status succeeded
  → _persist_run_snapshot → isolate A /tmp/graphs.db
  → POST body returns events + result to the browser
  → UI GET /nodes (and later history GET run+nodes)
       ├─ isolate A → 200
       └─ isolate B → 404 run not found
  → Uncaught jsonFetch 404 + empty inspection path
```

---

## 5. PTR — resolution plan

### Goal

A completed run remains inspectable after POST, and 404s are **terminal, explained, and not thrown as uncaught errors**. Durable history requires shared storage.

### P0 — UI: stop 404 storm; keep POST traces (implemented)

**Files:** `apps/playground/src/watchRun.ts`, `apps/playground/src/App.tsx`, `apps/playground/src/runInspection.ts`

1. Treat `GET … (404) run not found` as terminal in `watchRunCompletion` (already stopped on any poll error; now a specific hint + in-flight guard so overlapping 1s polls do not pile up).
2. Catch history `Promise.all` 404s: keep the in-memory POST summary if it is the same `run_id`; otherwise show a failed summary with the isolate hint. **Do not** throw uncaught.
3. If `GET /nodes` fails after a terminal POST, rebuild traces from `summary.events` so the canvas path still paints.

**AC:**

- Clicking Run history for a missing isolate run does not spam `Uncaught Error`.
- After serverless POST with events, canvas inspection still highlights executed nodes when `/nodes` 404s.
- `npm test` in `apps/playground` and `uv run pytest -q` in `backend/` pass.

### P1 — Operator: object store (recommended) or Turso + confirm Groq

Vercel → Project → Environment Variables (Production + Preview), then redeploy. **Do not commit secrets.** Prefer a free-tier S3-compatible bucket (Cloudflare R2, AWS S3, MinIO, Azure Blob S3 API):

| Variable | Purpose |
| -------- | ------- |
| `OBJECT_STORE_BUCKET` | Bucket name |
| `OBJECT_STORE_ENDPOINT` | Optional. Empty = AWS. R2: `https://<accountid>.r2.cloudflarestorage.com` |
| `OBJECT_STORE_ACCESS_KEY_ID` | Access key |
| `OBJECT_STORE_SECRET_ACCESS_KEY` | Secret |
| `OBJECT_STORE_REGION` | Optional. `us-east-1` default; `auto` for R2 |
| `GROQ_API_KEY` | Already working for this incident; keep set |

Optional alternative (ignored when object-store env is set): `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`.

Smoke after a shared store is set:

1. `GET /api/health` → **200** with `ok: true` and `storage_backend` not `sqlite`.
2. Run → immediately open the same `run_id` on a **new** browser tab / after ~2 minutes → `GET /api/runs/{id}` **200** from any isolate.

Optional: `CHAT_PROVIDER=groq` in the dashboard if you want omitted-provider API clients to default to Groq. The playground always sends an explicit provider (default **stub** until changed).

### P2 — Diagnostics and API shape

1. **Implemented:** `GET /api/health` returns `{ "ok": true|false, "storage_backend": "vercel_blob"|"object_store"|"turso"|"sqlite" }` (503 when unhealthy). On Vercel without durable storage, API routes fail closed with 503 instead of silently using ephemeral `/tmp` SQLite.
2. Include node traces on the serverless POST `RunSummary` (or a `traces` field) so the client never needs a second GET for the run it just created.
3. Persist `events` in the run snapshot schema (today GET-from-storage reconstructs summary + traces, not the live event log).

**Operator smoke (after deploy):** `GET /api/health` → `200` with `ok: true` and `storage_backend: "vercel_blob"` (or `object_store` / `turso`). If `ok: false` and `storage_backend: "sqlite"`, set `BLOB_READ_WRITE_TOKEN` (recommended) or `OBJECT_STORE_*` / `TURSO_*` and redeploy.

### Non-goals

- Replacing Groq with stub in production (not what happened here).
- Multi-tenant auth / RLS.
- Deploying this P0 from the RCA session (operator deploys after review).

---

## 6. Key code paths

| Path | Role |
| ---- | ---- |
| `backend/app/main.py` | `POST /api/runs` inline on Vercel; `GET /api/runs/{id}` 404 if summary missing |
| `backend/app/runtime.py` | `RUN_STORE` then `storage.get_run`; `_persist_run_snapshot` in `_execute` finally |
| `backend/app/storage.py` | File SQLite vs object store vs Turso (`storage_backend()`) |
| `vercel.json` | `GRAPH_DB_PATH=/tmp/graphs.db`, `CHAT_PROVIDER=stub` |
| `apps/playground/src/App.tsx` | `handleSelectHistoricalRun` Promise.all; `applyTerminalSummary` GET /nodes |
| `apps/playground/src/watchRun.ts` | 1s poll of `getRun` when POST is not already terminal |
| `packages/agent-graph-sdk/src/client.ts` | `jsonFetch` throws on non-OK |

---

## 7. Verification

| Check | Pass |
| ----- | ---- |
| Production HTML bundle `index-BmJ0fxtP.js` matches `35c1e71` deploy | Yes |
| Groq `chat/completions` during `POST /api/runs` for `run_050c7112940b` | Yes |
| Mixed 200/404 on same `run_id` across isolates | Yes — Turso not active |
| Playground tests after P0 UI | 9 passed (`npm test` in playground workspace) |
| Backend pytest | 67 passed — GET already used `storage.get_run`; no backend change |

---

## 8. Operator actions

1. Create a free R2 or S3 bucket and set `OBJECT_STORE_*` (Production + Preview). Do not commit secrets. Turso remains an optional alternative.
2. Confirm `GROQ_API_KEY` remains set (it was used successfully in this incident).
3. Redeploy production after merging P0 UI / object-store persistence.
4. Smoke: Groq Run → result visible → history click on another cold load still 200.
5. Until a shared store is set, treat Run history as **best-effort**; the POST response is the source of truth for that session.

---

## 9. Timeline

| Time (UTC) | Event |
| ---------- | ----- |
| 2026-09-10 ~16:21:44 | User selects Groq; catalog + credentials |
| 2026-09-10 16:21:47 | `POST /api/runs` 200; Groq completions 200; `run_050c7112940b` |
| 2026-09-10 16:21:47–50 | GET run + nodes **200** (same isolate) |
| 2026-09-10 16:23:44–48 | Mixed **200/404** on same run id; uncaught client errors |
| 2026-09-10 16:25:59 | GET pair **200** again |
| 2026-09-10 | RCA; small P0 UI implemented (not deployed in this session) |
