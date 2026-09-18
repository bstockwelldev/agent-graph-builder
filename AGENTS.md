# AGENTS.md — Agent Graph Builder

Lean router for autonomous work in **this repository only**.

## Purpose

Visual graph-authoring studio + FastAPI/LangGraph execution API. Proves
graph-driven agent workflows with streamed node-level observability, a full
resource model (agents/prompts/tools/MCP/LLM profiles), and a
right-click/hotkey/command-palette workbench with a persisted chat
scratchpad. `apps/playground` (the original Vite/React POC UI) was deleted
in the studio-consolidation program's Phase 6 — `apps/studio` is the only
frontend now.

## Where to work

| Area | Path | Notes |
| ---- | ---- | ----- |
| Studio (Next.js/React) | `apps/studio/` | Canvas, run panel, resource CRUD screens, workbench (command palette, chat) |
| SDK (shared types/client) | `packages/agent-graph-sdk/` | Zod schemas (`schemas.ts`) are the source of truth; `types.ts` derives via `z.infer<>`; `client.ts` validates every response |
| Backend (FastAPI) | `backend/app/` | Compile, run, node executors, providers, storage, telemetry, RAG |
| Planning | `docs/planning/` | Roadmap, feature specs, incidents |

Package manager is **pnpm** (workspace root has `pnpm-workspace.yaml`), not npm.

## Commands

From repo root:

```bash
pnpm install
pnpm -r typecheck && pnpm -r lint && pnpm run test && pnpm run build
```

From `backend/`:

```bash
uv sync --extra dev
uv run pytest -q
uv run uvicorn app.main:app --reload --port 8000
```

Docker (full stack): `docker compose up` or `scripts/dev.sh up` / `scripts/dev.ps1 up`.

Production URL: https://agent-graph-builder-app.vercel.app
(`GET /api/health` → `{ok:true, storage_backend:"..."}`). Legacy aliases:
`agent-graph-builder-poc.vercel.app`, `theagenticengineer-graph-builder.vercel.app`.
Bare `agent-graph-builder.vercel.app` is unavailable (another account).

Production deploy (operator): `vercel deploy --prod` from repo root after
merge. Set secrets in the Vercel dashboard (Project → Environment
Variables); do not commit them:

| Variable | Purpose |
| -------- | ------- |
| `GROQ_API_KEY` | Live LLM provider (optional; `CHAT_PROVIDER=stub` until set) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase Storage backend + studio OAuth |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token (`vercel blob create-store`) |
| `OBJECT_STORE_BUCKET` / `OBJECT_STORE_ENDPOINT` / `OBJECT_STORE_ACCESS_KEY_ID` / `OBJECT_STORE_SECRET_ACCESS_KEY` / `OBJECT_STORE_REGION` | S3-compatible alternative (Cloudflare R2, AWS S3, MinIO, Azure S3 API) |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Optional libsql alternative |
| `LANGFUSE_*` | Optional telemetry tracing — noop when unset |

Backend selection order (`storage_backend()`): Supabase → Vercel Blob →
S3-compatible object store → Turso → file SQLite. Without a shared store,
production uses ephemeral `/tmp/graphs.db` per serverless isolate
(`GRAPH_DB_PATH` in `vercel.json`). Local/Docker use file SQLite at
`GRAPH_DB_PATH` or `backend/graphs.db`.

## Layout

```
apps/studio/              # Next.js studio: canvas, resource CRUD, workbench
packages/agent-graph-sdk/ # Zod schemas, types, API client, graph fingerprints
backend/app/              # FastAPI routes, runtime, node executors, providers,
                           # storage, telemetry, knowledge/RAG
docs/planning/            # Roadmap + locked feature specs
.github/workflows/ci.yml  # backend pytest + studio lint/typecheck/test/build
```

## CI

GitHub Actions on push/PR to `master`, two jobs: `backend` (`uv sync --extra
dev && uv run pytest`), `studio` (`pnpm install --frozen-lockfile`, build the
SDK, then lint/typecheck/test/build the studio app).

Remote: `origin` → `bstockwelldev/agent-graph-builder`.

## Local secrets

- Copy provider keys to `backend/.env.local` (gitignored) or set `SHARED_ENV_FILE`.
- `load_app_env()` merges local `.env.local` then optional
  `$BSTOCKWELL_DEV_ROOT/tabletop-studio/.env.local` for unset vars only.
- Never commit `.env`, `.env.local`, or API keys.

## Planning paths

- Roadmap: `docs/planning/roadmap.md`
- Feature specs: `docs/planning/features/` (see
  `studio-consolidation-plan.md` for the program that replaced the
  playground with the studio and everything built on top of it since)
- Incidents: `docs/planning/incidents/`

## Must not

- Commit machine-specific absolute paths (use `<dev-root>` / `$env:BSTOCKWELL_DEV_ROOT`).
- Implement factory Dev CLI changes here (canonical home:
  `agent-context-factory/packages/local-dev-cli`).
- Run `vercel env` to set production secrets from agent sessions — operator
  sets dashboard vars.
- Use `npm`/`npx` for workspace commands — this repo is pnpm-only
  (`pnpm-workspace.yaml`); an `npm ci`/`npm install` will not resolve the
  workspace `@bstockwelldev/agent-graph-sdk` dependency correctly.

## Related

- Human runbook: `README.md`
- Polyrepo router: `$BSTOCKWELL_DEV_ROOT/AGENTS.md`
