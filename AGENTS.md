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

Production deploy (operator): `vercel deploy --prod` from repo root after merge. Set `GROQ_API_KEY` in the Vercel dashboard (Project → Environment Variables); do not commit secrets.

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
