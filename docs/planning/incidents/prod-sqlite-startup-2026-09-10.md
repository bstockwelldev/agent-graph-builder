---
title: Incident RCA + PTR — production startup SQLite failure
date: 2026-09-10
status: p0-implemented
severity: P0 (playground production — total outage)
url: https://agent-graph-builder-poc.vercel.app
---

# RCA + PTR — production SQLite startup failure

**Symptom:** Vercel production returns **500** on every request. Function logs show:

```text
sqlite3.OperationalError: unable to open database file
  at backend/app/storage.py — sqlite3.connect(DB_PATH)
  during bootstrap() in main.py — storage.get_graph(build_demo_graph().id)
```

**Outcome:** Root cause documented; P0 hotfix implemented in `backend/app/storage.py` (not yet deployed).

---

## 1. Situated problem

FastAPI boots with a `@app.on_event("startup")` handler that seeds the demo graph if missing. That handler calls `storage.get_graph()` → `_connect()` → `sqlite3.connect(DB_PATH)`.

On Vercel Python serverless, the **deployment bundle is read-only**. Only **`/tmp`** is writable. The app must open SQLite at a path under `/tmp` (configured as `GRAPH_DB_PATH=/tmp/graphs.db` in `vercel.json`).

If `GRAPH_DB_PATH` is absent at import/runtime, `storage.py` previously fell back to `backend/graphs.db` next to the app code — a **read-only** location on Vercel → `OperationalError: unable to open database file` before any HTTP handler runs.

**Actors:** Vercel Python serverless isolate, FastAPI bootstrap, SQLite at `GRAPH_DB_PATH` or fallback path.

---

## 2. Evidence

| Probe | Result |
| ----- | ------ |
| `vercel.json` `env.GRAPH_DB_PATH` | `/tmp/graphs.db` — correct for serverless |
| `storage.py` (before fix) | `DB_PATH = … if GRAPH_DB_PATH else backend/graphs.db` — **no Vercel guard** |
| `main.py` bootstrap | Runs on every cold start; first SQLite touch is `get_graph` |
| Vercel filesystem contract | Bundle read-only; `/tmp` writable (documented in prior incident RC4) |
| Local pytest without `GRAPH_DB_PATH` | Uses writable `backend/graphs.db` — masks production failure |
| Git history | `GRAPH_DB_PATH` in `vercel.json` since `33d0970`; bootstrap unchanged since early POC — **not introduced by P0 run-await** (`e7bdb76`) |

### What `DB_PATH` / `GRAPH_DB_PATH` are on Vercel

| Source | Expected value |
| ------ | -------------- |
| `vercel.json` → `env.GRAPH_DB_PATH` | `/tmp/graphs.db` |
| Vercel platform | `VERCEL=1` (automatic) |
| Fallback when env missing (pre-fix) | `backend/graphs.db` → **fails** (read-only) |
| Fallback when env missing (post-fix) | `/tmp/graphs.db` when `VERCEL` is set |

### Why SQLite fails to open

| Cause | Likelihood | Mechanism |
| ----- | ---------- | --------- |
| **RC1 — Fallback to read-only bundle path** | **Primary** | `GRAPH_DB_PATH` unset or empty in production runtime → `backend/graphs.db` in read-only `/var/task` |
| RC2 — Parent directory missing | Secondary | Custom `GRAPH_DB_PATH` with nested dir (e.g. `/tmp/data/graphs.db`) without `mkdir` |
| RC3 — Misconfigured dashboard env | Contributing | Operator sets `GRAPH_DB_PATH` to a non-`/tmp` path (e.g. copied from Docker `/data/graphs.db`) |
| RC4 — Read-only `/tmp` | Unlikely | Contradicts Vercel serverless contract; not observed in code |

### Regression?

**Not a logic regression from P0 run-await or workspace rename.** Bootstrap + SQLite path resolution were already fragile. A **new Vercel project**, **dashboard env drift** (missing `GRAPH_DB_PATH`), or **first cold start after env removal** can trigger total outage. Rename/deploy churn increases exposure but the underlying bug is missing Vercel-safe fallback + no `mkdir` before connect.

---

## 3. Root cause (summary)

**RC1:** `storage._connect()` opens SQLite at `DB_PATH`. When `GRAPH_DB_PATH` is not present in the serverless runtime environment, the module falls back to `backend/graphs.db` inside the read-only deployment tree. Vercel cannot create or open that file → startup `bootstrap()` crashes → all routes 500.

---

## 4. Causal chain

```text
Cold start / redeploy
  → import storage (DB_PATH resolved)
  → FastAPI startup → bootstrap()
  → storage.get_graph(demo_id)
  → sqlite3.connect(DB_PATH)
       ├─ GRAPH_DB_PATH=/tmp/graphs.db → OK (if env applied)
       └─ GRAPH_DB_PATH missing → backend/graphs.db (read-only) → OperationalError
  → function fails before serving HTTP
```

---

## 5. PTR — resolution plan

### Goal

Production always reaches a writable SQLite path on cold start, even when `GRAPH_DB_PATH` is missing from the runtime environment.

### P0 — Hotfix (implemented)

**File:** `backend/app/storage.py`

1. Add `resolve_db_path()`:
   - `GRAPH_DB_PATH` if set (non-empty)
   - else `/tmp/graphs.db` when `VERCEL` is set
   - else local `backend/graphs.db`
2. Before `sqlite3.connect`, `path.parent.mkdir(parents=True, exist_ok=True)`.
3. `_connect()` calls `resolve_db_path()` at connect time (not only import time).

**Tests:** `backend/tests/test_storage_db_path.py` — Vercel fallback, nested `mkdir`, bootstrap via `TestClient`.

**AC:**

- `uv run pytest -q` from `backend/` passes (60 tests)
- Cold start on Vercel with `GRAPH_DB_PATH` unset still boots and returns demo graph from `GET /api/graphs`

### P1 — Operator / deploy hygiene

1. Confirm Vercel project env: `GRAPH_DB_PATH=/tmp/graphs.db` (Production + Preview).
2. Redeploy after merging P0.
3. Smoke: `GET /api/graphs` → 200 with demo graph id.

### P2 — Turso / durable store (roadmap slice 4)

Ephemeral `/tmp` SQLite remains **per-instance** (see [prod-run-queue-limbo-2026-09-09.md](prod-run-queue-limbo-2026-09-09.md) RC4). For cross-instance graph/run history:

- Replace SQLite with Turso (libSQL) or hosted Postgres
- Remove bootstrap re-seed dependency on cold start
- **Ask first** before adding vendor credentials

### Non-goals

- Durable multi-tenant persistence in this hotfix
- Skipping bootstrap on Vercel (demo graph still required for playground)

---

## 6. Key code paths

| Path | Role |
| ---- | ---- |
| `backend/app/storage.py` | `resolve_db_path()`, `_connect()`, `mkdir` guard |
| `backend/app/main.py` | `bootstrap()` startup seeder |
| `vercel.json` | `GRAPH_DB_PATH=/tmp/graphs.db`, `maxDuration: 60` |
| `backend/tests/test_storage_db_path.py` | P0 regression tests |
| `docker-compose.yml` | Local `GRAPH_DB_PATH=/data/graphs.db` (unchanged) |

---

## 7. Verification

| Check | Pass |
| ----- | ---- |
| `uv run pytest -q` from `backend/` | 60 passed |
| Manual: Vercel cold start | `GET /api/graphs` 200; no `OperationalError` in logs |
| Manual: stub Run | `POST /api/runs` terminal status (P0 run-await from prior incident) |
| Env audit | `GRAPH_DB_PATH=/tmp/graphs.db` in Vercel dashboard |

---

## 8. Operator actions

1. Merge P0 fix to production branch.
2. **Vercel → Project → Settings → Environment Variables:** ensure `GRAPH_DB_PATH` = `/tmp/graphs.db` for Production and Preview (redundant with `vercel.json` but prevents drift).
3. **Redeploy** production (`vercel deploy --prod` or push to tracked branch).
4. Verify `GET https://agent-graph-builder-poc.vercel.app/api/graphs` returns 200.

---

## 9. Timeline

| Time (UTC) | Event |
| ---------- | ----- |
| 2026-09-10 | User report: production startup `sqlite3.OperationalError` |
| 2026-09-10 | RCA: read-only fallback path when `GRAPH_DB_PATH` missing on Vercel |
| 2026-09-10 | P0 implemented: `resolve_db_path()` + `mkdir` + tests (60 pass) |
