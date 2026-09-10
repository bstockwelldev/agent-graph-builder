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
npm ci && npm run build          # playground + SDK workspace build
```

From `backend/`:

```bash
uv sync --extra dev
uv run pytest -q
uv run uvicorn app.main:app --reload --port 8000
```

Docker (full stack): `docker compose up` or `scripts/spin-up.ps1`.

Production deploy (operator): `vercel deploy --prod` from repo root after merge. Set secrets in the Vercel dashboard (Project → Environment Variables); do not commit them:

| Variable | Purpose |
| -------- | ------- |
| `GROQ_API_KEY` | Live LLM provider (optional; `CHAT_PROVIDER=stub` until set) |
| `OBJECT_STORE_BUCKET` | **Recommended** durable store (S3 / R2 / MinIO / Azure S3 API) |
| `OBJECT_STORE_ENDPOINT` | Optional custom endpoint (R2/MinIO/Azure). Empty = AWS default |
| `OBJECT_STORE_ACCESS_KEY_ID` | Object-store access key |
| `OBJECT_STORE_SECRET_ACCESS_KEY` | Object-store secret |
| `OBJECT_STORE_REGION` | Optional. Default `us-east-1` (AWS) or `auto` when endpoint is set |
| `TURSO_DATABASE_URL` | Optional libsql URL (unused if `OBJECT_STORE_*` is set) |
| `TURSO_AUTH_TOKEN` | Turso token (required with `TURSO_DATABASE_URL`) |

Backend selection: `OBJECT_STORE_*` (when bucket + both keys are set) → else `TURSO_*` → else file SQLite. Without a shared store, production uses ephemeral `/tmp/graphs.db` per serverless isolate (`GRAPH_DB_PATH` in `vercel.json`). Local/Docker use file SQLite at `GRAPH_DB_PATH` or `backend/graphs.db`.

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
