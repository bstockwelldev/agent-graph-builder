# AGENTS.md — Agent Graph Builder

Lean router for autonomous work in **this repository only**.

## Purpose

Visual graph authoring studio (Next.js, `apps/studio`) + FastAPI/LangGraph execution API + `@bstockwelldev/agent-graph-sdk` (1.0.0 on npm). 13 `NodeType`s (`backend/app/models.py`), six provider adapters behind `ChatModel`, releases, replay, streamed node-level events. There is no `apps/playground` anymore — ignore older docs that mention it.

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
pnpm install && pnpm test && pnpm run build   # pnpm workspace; `test` builds SDK dist first (studio Vitest imports it)
pnpm dev                                        # studio on :3000, proxies /api to 127.0.0.1:8000 (API_PROXY_TARGET)
```

Studio-only gates (CI runs these): `pnpm --filter @bstockwelldev/agent-graph-studio run lint` / `run typecheck`.

From `backend/`:

```bash
uv sync --extra dev
uv run pytest -q
uv run uvicorn app.main:app --reload --port 8000
```

API contract (after changing a Pydantic model or route): `cd backend && uv run python -m scripts.export_openapi`, then `pnpm --filter @bstockwelldev/agent-graph-sdk run generate`. CI fails on drift in either file. Structural graph checks: update `packages/agent-graph-sdk/contract/structural-fixtures.json` when compiler structure rules change (backend and SDK both test against it); a new route needs a handler in the SDK's `src/testing/handlers.ts` (a coverage test enforces it). SDK changes need a changeset (`pnpm changeset`); release = `pnpm changeset version` merged, then run the **Release SDK** workflow (manual; publishes via npm Trusted Publishing, so there is no npm token to manage).

Docker (full stack, studio :3000 + API :8000): `docker compose up --build`, or `scripts/dev.ps1 up` / `scripts/dev.sh up` (`spin-up.*` are deprecated forwarders).

Tests write to the default dev DB: `uv run pytest` leaves test graphs in `backend/graphs.db` (no `GRAPH_DB_PATH` isolation in `conftest.py`). Delete it (gitignored) for a clean demo-only library.

Production: a Vercel deployment backed by Supabase Storage (`GET /api/health` reports `storage_backend`). The Vercel Blob backend was removed and must not be reintroduced. Hostnames, project and bucket names live with the operator, not in this repo.

Production deploy (operator): `vercel deploy --prod` from repo root after merge. Set secrets in the Vercel dashboard (Project → Environment Variables); do not commit them:

| Variable | Purpose |
| -------- | ------- |
| `GROQ_API_KEY` | Live LLM provider (optional; `CHAT_PROVIDER=stub` until set) |
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

GitHub Actions (`.github/workflows/ci.yml`) on push to `master`/`main` and on every PR: `backend` (`uv sync --extra dev` + `uv run pytest`), `studio` (`pnpm install --frozen-lockfile`, build SDK, studio lint + typecheck, `pnpm run test`, `pnpm run build`), and `sdk-package` (build, typecheck, `pnpm run check`, `pnpm run docs` in `packages/agent-graph-sdk`).

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
