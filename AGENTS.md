# AGENTS.md — Agent Graph Builder

Lean router for autonomous work in **this repository only**.

## Purpose

Visual graph authoring playground + FastAPI/LangGraph execution API. Proves graph-driven agent workflows with streamed node-level observability.

## Where to work

| Area | Path | Notes |
| ---- | ---- | ----- |
| Playground (Vite/React) | `apps/playground/` | Canvas, run panel, SSE event log |
| SDK (shared types/client) | `packages/agent-graph-sdk/` | Graph schema, API client, fingerprints |
| Backend (FastAPI) | `backend/app/` | Compile, run, providers, storage |
| Planning | `docs/planning/` | Roadmap, feature specs, incidents |

## Commands

From repo root:

```bash
npm ci && npm test && npm run build   # SDK dist first (playground Vitest imports it), then tests, then full build
```

From `backend/`:

```bash
uv sync --extra dev
uv run pytest -q
uv run uvicorn app.main:app --reload --port 8000
```

API contract (after changing a Pydantic model or route): `cd backend && uv run python -m scripts.export_openapi`, then `pnpm --filter @bstockwelldev/agent-graph-sdk run generate`. CI fails on drift in either file. Structural graph checks: update `packages/agent-graph-sdk/contract/structural-fixtures.json` when compiler structure rules change (backend and SDK both test against it); a new route needs a handler in the SDK's `src/testing/handlers.ts` (a coverage test enforces it).

Docker (full stack): `docker compose up` or `scripts/spin-up.ps1`.

Production URL: https://agent-graph-builder-app.vercel.app (`GET /api/health` → `{ok:true, storage_backend:"supabase"}`; Supabase Storage bucket `agent-graph-builder` in the `supabase-tabletop-studio-db` project). Prod left Vercel Blob on 2026-09-24: the Hobby Blob store was suspended for exceeding its monthly operation limits (2k advanced / 10k simple), which locks it for 30 days — do not re-add `BLOB_READ_WRITE_TOKEN` to prod without fixing the N+1 list reads first. Legacy aliases: `agent-graph-builder-poc.vercel.app`, `theagenticengineer-graph-builder.vercel.app`. Bare `agent-graph-builder.vercel.app` is unavailable (another account).

Production deploy (operator): `vercel deploy --prod` from repo root after merge. Set secrets in the Vercel dashboard (Project → Environment Variables); do not commit them:

| Variable | Purpose |
| -------- | ------- |
| `GROQ_API_KEY` | Live LLM provider (optional; `CHAT_PROVIDER=stub` until set) |
| `BLOB_READ_WRITE_TOKEN` | **Recommended on Vercel** — Blob store injects this (`vercel blob create-store`) |
| `BLOB_STORE_ID` | Optional. Blob store id if not encoded in the token |
| `OBJECT_STORE_BUCKET` | S3-compatible alternative (Cloudflare R2, AWS S3, MinIO, Azure S3 API) |
| `OBJECT_STORE_ENDPOINT` | Optional custom endpoint (R2/MinIO/Azure). Empty = AWS default |
| `OBJECT_STORE_ACCESS_KEY_ID` | Object-store access key |
| `OBJECT_STORE_SECRET_ACCESS_KEY` | Object-store secret |
| `OBJECT_STORE_REGION` | Optional. Default `us-east-1` (AWS) or `auto` when endpoint is set |
| `TURSO_DATABASE_URL` | Optional libsql URL (unused if Blob or `OBJECT_STORE_*` is set) |
| `TURSO_AUTH_TOKEN` | Turso token (required with `TURSO_DATABASE_URL`) |

Backend selection: `BLOB_READ_WRITE_TOKEN` → else `OBJECT_STORE_*` (bucket + both keys) → else `TURSO_*` → else file SQLite. Without a shared store, production uses ephemeral `/tmp/graphs.db` per serverless isolate (`GRAPH_DB_PATH` in `vercel.json`). Local/Docker use file SQLite at `GRAPH_DB_PATH` or `backend/graphs.db`.

## Layout

```
apps/playground/          # React Flow editor + run UX
packages/agent-graph-sdk/ # Types, client, graph fingerprints
backend/app/              # FastAPI routes, runtime, providers
docs/planning/            # Roadmap + locked feature specs
.github/workflows/ci.yml  # pytest + npm build on master
```

## CI

GitHub Actions on push/PR to `master`: backend `uv sync --extra dev` + `uv run pytest`; root `npm ci && npm run build`.

Remote: `origin` → `bstockwelldev/agent-graph-builder`.

## Local secrets

- Copy provider keys to `backend/.env.local` (gitignored) or set `SHARED_ENV_FILE`.
- `load_app_env()` merges local `.env.local` then optional `$BSTOCKWELL_DEV_ROOT/tabletop-studio/.env.local` for unset vars only.
- Never commit `.env`, `.env.local`, or API keys.

## Planning paths

- Roadmap: `docs/planning/roadmap.md`
- Feature specs: `docs/planning/features/`
- Incidents: `docs/planning/incidents/`

## Must not

- Commit machine-specific absolute paths (use `<dev-root>` / `$env:BSTOCKWELL_DEV_ROOT`).
- Implement factory Dev CLI changes here (canonical home: `agent-context-factory/packages/local-dev-cli`).
- Run `vercel env` to set production secrets from agent sessions — operator sets dashboard vars.

## Related

- Human runbook: `README.md`
- Polyrepo router: `$BSTOCKWELL_DEV_ROOT/AGENTS.md`
