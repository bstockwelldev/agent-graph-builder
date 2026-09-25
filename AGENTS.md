# AGENTS.md — Agent Graph Builder

Lean router for autonomous work in **this repository only**.

## Purpose

Visual graph authoring studio + FastAPI/LangGraph execution API. Proves graph-driven agent workflows with streamed node-level observability.

## Where to work

| Area | Path | Notes |
| ---- | ---- | ----- |
| Studio (Next.js) | `apps/studio/` | Canvas, run panel, SSE event log (styling rules: `apps/studio/AGENTS.md`) |
| SDK (shared types/client) | `packages/agent-graph-sdk/` | Graph schema, API client, fingerprints |
| Backend (FastAPI) | `backend/app/` | Compile, run, providers, storage |
| Planning | `docs/planning/` | Roadmap, feature specs, incidents |

## Commands

From repo root:

```bash
npm ci && npm test && npm run build   # SDK dist first (studio Vitest imports it), then tests, then full build
```

From `backend/`:

```bash
uv sync --extra dev
uv run pytest -q
uv run uvicorn app.main:app --reload --port 8000
```

API contract (after changing a Pydantic model or route): `cd backend && uv run python -m scripts.export_openapi`, then `pnpm --filter @bstockwelldev/agent-graph-sdk run generate`. CI fails on drift in either file. Structural graph checks: update `packages/agent-graph-sdk/contract/structural-fixtures.json` when compiler structure rules change (backend and SDK both test against it); a new route needs a handler in the SDK's `src/testing/handlers.ts` (a coverage test enforces it). SDK changes need a changeset (`pnpm changeset`); release = `pnpm changeset version` merged, then run the **Release SDK** workflow (manual; needs the `NPM_TOKEN` secret).

Docker (full stack): `docker compose up` or `scripts/spin-up.ps1`.

Production URL: https://agent-graph-builder-app.vercel.app (`GET /api/health` → `{ok:true, storage_backend:"supabase"}`; Supabase Storage bucket `agent-graph-builder` in the `supabase-tabletop-studio-db` project). The Vercel Blob backend was removed after the 2026-09-24 store suspension; the old store is purged manually — don't reintroduce or read from it. Legacy aliases: `agent-graph-builder-poc.vercel.app`, `theagenticengineer-graph-builder.vercel.app`. Bare `agent-graph-builder.vercel.app` is unavailable (another account).

Production deploy (operator): `vercel deploy --prod` from repo root after merge. Set secrets in the Vercel dashboard (Project → Environment Variables); do not commit them:

| Variable | Purpose |
| -------- | ------- |
| `GROQ_API_KEY` | Live LLM provider (optional; `CHAT_PROVIDER=stub` until set). Visitors can't use it: `vercel.json` sets `PUBLIC_DEMO_MODE=1` (README → Public demo mode) |
| `SUPABASE_URL` | **Prod storage** — Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-only; required with `SUPABASE_URL`) |
| `SUPABASE_STORAGE_BUCKET` | Optional. Private bucket, default `agent-graph-builder` |
| `OBJECT_STORE_BUCKET` | S3-compatible alternative (Cloudflare R2, AWS S3, MinIO, Azure S3 API) |
| `OBJECT_STORE_ENDPOINT` | Optional custom endpoint (R2/MinIO/Azure). Empty = AWS default |
| `OBJECT_STORE_ACCESS_KEY_ID` | Object-store access key |
| `OBJECT_STORE_SECRET_ACCESS_KEY` | Object-store secret |
| `OBJECT_STORE_REGION` | Optional. Default `us-east-1` (AWS) or `auto` when endpoint is set |
| `TURSO_DATABASE_URL` | Optional libsql URL (unused if Supabase or `OBJECT_STORE_*` is set) |
| `TURSO_AUTH_TOKEN` | Turso token (required with `TURSO_DATABASE_URL`) |

Backend selection: `SUPABASE_*` → else `OBJECT_STORE_*` (bucket + both keys) → else `TURSO_*` → else file SQLite. On Vercel without a shared store the API returns 503 (per-isolate `/tmp/graphs.db` would lose runs across requests). Local/Docker use file SQLite at `GRAPH_DB_PATH` or `backend/graphs.db`; stub runs there show as **Offline** in the Run panel and are also cached in the browser (`apps/studio/lib/runCache.ts`).

## Layout

```
apps/studio/              # Next.js studio: React Flow editor + run UX
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
