# Agent Graph Builder

A visual graph-authoring studio for LLM agent workflows, with a real
execution engine underneath: **`apps/studio`** (Next.js 15 / React 19) is
the product surface, **`backend/`** (Python + FastAPI + LangGraph) compiles
and runs the graphs, and **`@bstockwelldev/agent-graph-sdk`** is the shared
TypeScript contract between them.

> A user can visually assemble a graph, execute it, and inspect the
> execution path and outputs without writing agent orchestration code.

This repo started as a scoped-down POC (`apps/playground`, six node types,
one demo workflow) proving the graph-execution half of that thesis. A
consolidation program (see
[`docs/planning/features/studio-consolidation-plan.md`](docs/planning/features/studio-consolidation-plan.md))
then absorbed a sibling project's design system and studio product surface
(`micro-ui-agent-builder`, now archived) on top of the same engine, replaced
`apps/playground` outright, and kept building: a full resource model
(agents/prompts/tools/MCP servers/LLM profiles), telemetry, RAG, Supabase
auth, run analytics, and — most recently — a right-click/hotkey/command-palette
"workbench" with a persisted, direct-model chat scratchpad. `apps/playground`
no longer exists; `apps/studio` is the only frontend.

## What this proves

1. **Graph authoring works visually** — React Flow canvas, a 12-type node
   palette, per-type config panels, conditional/default/sequence edge
   authoring, dagre auto-layout, undo, and live compile-time diagnostics as
   you edit.
2. **Execution follows the graph, not hard-coded orchestration** — the
   backend compiles graph JSON into a real
   [LangGraph](https://github.com/langchain-ai/langgraph) `StateGraph`
   (`backend/app/runtime.py`); there is no `if/else` chain describing "the"
   workflow anywhere in the runtime.
3. **Agent/model nodes are configured independently of the graph** — LLM
   and tool-loop nodes call a provider-neutral `ChatModel` protocol
   (`backend/app/providers/base.py`); adapters include **Stub** (offline),
   **Groq**, **Google Gemini**, **Azure OpenAI**, **Ollama** (local), and
   **OpenAI-compatible HTTP**. Swapping providers means adding an adapter,
   not touching the compiler or node executors.
4. **Execution is observable at the node level** — every node emits
   `node.started` / `node.completed` / `node.failed` / `edge.selected` events
   over SSE, and the studio's Run panel shows live event log, per-node
   input/output traces, and durable run history.
5. **The node vocabulary covers real agent patterns, not just a demo** —
   beyond the original 6 (Input/Prompt/LLM/Tool/Router/Output), 6 more are
   fully executable: `guardrail`, `rubric`, `human_gate` (pauses a run for
   approval — `POST /api/runs/{id}/resume`), `tool_loop`, `code_exec`, and
   `branch`.
6. **The workbench keeps everything in reach without leaving the canvas** —
   a command palette (`Cmd/Ctrl+K`), per-panel hotkeys, and a right-click
   context menu open the node palette, run panel, graph switcher, resource
   registries, and a persisted direct-model chat scratchpad as floating
   panels (or slide-in drawers on narrow viewports), not separate pages.

## Stack

- **Backend**: Python + FastAPI + LangGraph, `uv` for dependency management.
- **Studio** (`apps/studio`): Next.js 15 + React 19 + Tailwind 4 + shadcn/Base
  UI, `@xyflow/react` (React Flow) for the canvas.
- **SDK** (`packages/agent-graph-sdk`): `@bstockwelldev/agent-graph-sdk` —
  Zod schemas as the single source of truth, types derived via `z.infer<>`,
  and a runtime-validated API client.
- **Model providers**: Stub, Groq, Google Gemini, Azure OpenAI, Ollama, or
  OpenAI-compatible HTTP; selected per run or per chat session; factory in
  `backend/app/providers/base.py`.
- **Persistence**: file SQLite locally; Supabase Storage, Vercel Blob,
  S3-compatible object store, or Turso in production (`storage_backend()`
  dispatches by which env vars are set). Live SSE streams are in-memory only
  for active runs.
- **Auth**: optional Supabase OAuth (`apps/studio/lib/supabase/`), fails open
  — unset the Supabase env vars and the studio behaves exactly as before,
  no gate.
- **Telemetry**: optional Langfuse tracing (`backend/app/telemetry/`),
  env-gated with a noop fallback.

## Running it

### Option A: Docker (recommended)

Prerequisites: Docker Desktop. Ollama is optional — the studio defaults to
**Stub (offline)** so everything runs without a local model. Switch to
**Ollama (local LLM)** when you have [Ollama](https://ollama.com) running on
the host with a model pulled (defaults to `qwen2.5:3b`). Ollama itself is
**not** containerized on purpose — kept on the host so the containers reuse
models you've already pulled; the backend container reaches it at
`http://host.docker.internal:11434`.

```bash
docker compose up --build
```

**One-command dev stack (repo):**

```powershell
# Foreground (logs in terminal)
.\scripts\dev.ps1 up

# Background
.\scripts\dev.ps1 up -d

# Stop
.\scripts\dev.ps1 down

# Stop and remove saved-graph volume
.\scripts\dev.ps1 down -v
```

Git Bash / WSL / macOS / Linux: `./scripts/dev.sh up`, `./scripts/dev.sh up -d`, `./scripts/dev.sh down`.

- Backend: http://localhost:8000 (FastAPI + LangGraph, live-reloads on edits
  to `backend/app/`)
- Studio: http://localhost:3000 (Next.js dev server, live-reloads on edits to
  `apps/studio/`)
- Saved graphs persist in a named volume (`graph_db`) instead of a bare file,
  so `docker compose down` (without `-v`) keeps them across restarts.

Both services bind-mount their source directories, so the containers behave
like the bare-metal dev servers below — same hot reload, same code — just
process-isolated. Stop with `docker compose down` (add `-v` to also drop the
saved-graphs volume).

If your Ollama instance is slow or under load, LLM node calls can
legitimately take a while; the provider adapter uses a generous (180s)
timeout rather than treating a slow local model as a hard failure
(`backend/app/providers/ollama.py`).

### Option B: bare metal

Prerequisites: Python 3.11+, `uv`, Node 20+, `pnpm`. Ollama is only required
when you select **Ollama (local LLM)**.

```bash
# Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Studio (separate terminal, from repo root)
pnpm install
pnpm run build:sdk
pnpm run dev
```

### Either way

Open http://localhost:3000 — the studio redirects to `/graphs`. Open or
create a graph; the canvas HUD opens the node palette and Run panel by
default on desktop (they collapse into slide-in drawers on narrow
viewports). Press `Cmd/Ctrl+K` from anywhere to jump to a route or open a
workbench panel (Agents/Prompts/Tools/MCP/LLM Profiles/Chat) without
navigating away from what you're doing; each panel also has its own hotkey
and a right-click entry where one makes sense. The Run panel defaults to
**Stub (offline)** — click **Run** without Ollama, inspect the live event
log and per-node traces, then try a real provider for live model output.

### Studio routes

| Route | Purpose |
|---|---|
| `/graphs`, `/graphs/[id]` | Graph list + full-bleed canvas editor |
| `/agents`, `/prompts`, `/tools`, `/mcp`, `/llm-profiles` | Resource CRUD screens |
| `/genui` | GenUI docs + live preview |
| `/runs`, `/runs/[graphId]` | Run history (pick a graph, see its runs) |
| `/analytics` | Cross-graph run totals + spend estimate |
| `/login`, `/auth/callback` | Supabase OAuth (no-op unless configured) |

Every resource kind above also has a compact list-only "workbench" panel
(open via the command palette or the shell), so switching context to check
an agent or tool doesn't require leaving the graph canvas.

### Graph API

| Action | API |
|---|---|
| List / create / get / save / delete a graph | `GET/POST /api/graphs`, `GET/PUT/DELETE /api/graphs/{id}` |
| Live validate the current canvas (debounced, no save) | `POST /api/graphs/validate` |
| Compile (saves first) | `POST /api/graphs/{id}/compile` |
| Run (SSE event stream) | `POST /api/runs` + `GET /api/runs/{id}/events` |
| Resolve a paused `human_gate` checkpoint | `POST /api/runs/{id}/resume` |
| Run history (per-graph, and cross-graph) | `GET /api/graphs/{id}/runs`, `GET /api/runs` |
| Inspect a past run | `GET /api/runs/{id}` + `GET /api/runs/{id}/nodes` |
| Run analytics / spend estimate | `GET /api/analytics` |

Graph definitions and run history persist via whichever storage backend is
configured (see **Model providers and storage** below); after a backend
restart, past runs remain in history — only in-flight SSE streams are lost.

### Resource registries

Prompts, tools, MCP servers, agents, and LLM profiles are stored resources
with generic CRUD routes (`/api/prompts`, `/api/tools`, `/api/mcp-servers`,
`/api/agents`, `/api/llm-profiles`), each with a matching SDK client method
(`client.prompts`, `client.tools`, …) and a studio CRUD screen. Tool nodes
bind to a registry entry by id; built-in tools include `web_search`
(DuckDuckGo Instant Answer) and `calculator`. MCP servers are reachable via
a hand-rolled JSON-RPC 2.0 HTTP client (`backend/app/mcp/`).

### Chat sessions (direct model scratchpad)

A `ChatSession` is a persisted, free-form chat straight to a chosen
provider/model — it bypasses the graph engine entirely (no compile step, no
`graph_id`). Open it via the command palette, the `Cmd/Ctrl+Shift+C` hotkey,
or the workbench: `client.chatSessions.list/get/create` manage sessions,
`client.sendChatMessage(id, content)` sends a message
(`POST /api/chat-sessions/{id}/messages`). The command palette's "Recent
sessions" group reopens the last few sessions directly.

### Model providers and storage

| Provider | When to use | How to select |
|---|---|---|
| **Stub** | Offline demos, CI, fast routing proof | UI default; or `provider: "stub"`; or `CHAT_PROVIDER=stub` |
| **Groq** | Hosted Llama via Groq | UI **Groq**; uses `GROQ_API_KEY` |
| **Google Gemini** | Gemini models via Generative Language API | UI **Google Gemini**; uses `GOOGLE_GENAI_API_KEY` or `GOOGLE_API_KEY` |
| **Azure OpenAI** | Hosted chat via Azure deployment id | UI **Azure OpenAI**; uses `AZURE_OPENAI_*` env vars |
| **Ollama** | Real local LLM via Ollama | UI **Ollama (local LLM)**; or `CHAT_PROVIDER=ollama` |
| **OpenAI-compatible** | OpenAI, OpenRouter, LM Studio, vLLM, etc. | UI **OpenAI-compatible (HTTP)**; uses `OPENAI_COMPAT_*` env vars |

Stub classifies using the same lookup keywords as the demo tool node;
non-classifier LLM nodes return a short deterministic `[stub answer] …`
string; the multi-turn chat protocol (`generate(history=...)`) is
implemented by every adapter, with Stub ignoring history entirely.

Storage backend is chosen by `storage_backend()` based on which env vars are
set, checked in this order: Supabase (`SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`) → Vercel Blob (`BLOB_READ_WRITE_TOKEN`) →
S3-compatible object store (`OBJECT_STORE_*`) → Turso (`TURSO_DATABASE_URL`)
→ file SQLite. See `backend/env.template` for every variable name.

### Shared env with tabletop-studio

On backend startup, `env_config.py` loads AI keys from a sibling repo dotenv
file when present (never committed) — `SHARED_ENV_FILE` (explicit path) or
`$BSTOCKWELL_DEV_ROOT/tabletop-studio/.env.local`. Keys already in the
process environment are **not** overwritten. See `backend/env.template` for
variable names. This is local-dev-only convenience, unrelated to production
storage/auth.

### Optional polyrepo dev CLI

A global `dev` CLI (canonical home: `agent-context-factory`) can register
this repo's Docker stack for one-word start/stop from any terminal —
`dev up graph -d`, `dev down graph`, `dev check graph`. See
`scripts/install-dev-cli.ps1` and
`agent-context-factory/docs/onboarding/workflows.md` (§12). Not required —
`docker compose up` and `scripts/dev.sh`/`dev.ps1` work standalone.

### Verification

**Backend (no Ollama required):**

```bash
cd backend
uv sync --extra dev
uv run pytest -q
```

**Frontend (SDK + studio):**

```bash
pnpm install
pnpm -r typecheck && pnpm -r lint && pnpm run test && pnpm run build
```

**Manual backend smoke (requires Ollama):**

```bash
cd backend
uv run python smoke_test.py
```

Compiles and executes the demo graph, printing the full event stream. Uses
`CHAT_PROVIDER` (default `ollama`); set `CHAT_PROVIDER=stub` for an offline
run.

## CI and publishing

GitHub Actions (`.github/workflows/ci.yml`) runs two jobs on every push/PR:
`backend` (`uv run pytest`) and `studio` (pnpm install, build the SDK, then
lint/typecheck/test/build the studio app). No secrets are required — tests
use the Stub provider.

**Planning specs:** locked feature plans live in
[`docs/planning/`](docs/planning/). **Product roadmap:**
[`docs/planning/roadmap.md`](docs/planning/roadmap.md).

### Vercel (production)

**URL:** https://agent-graph-builder-app.vercel.app

Health check: `GET /api/health` → `{"ok":true,"storage_backend":"..."}`.

**Legacy aliases** (still work; bookmarks OK):
[agent-graph-builder-poc.vercel.app](https://agent-graph-builder-poc.vercel.app),
[theagenticengineer-graph-builder.vercel.app](https://theagenticengineer-graph-builder.vercel.app).

> **Note:** `agent-graph-builder.vercel.app` is **not** this project — that
> bare alias is owned by another Vercel account and cannot be claimed.

`vercel.json` uses Vercel's `services`-based config: a Next.js `studio`
service (`apps/studio`) and a Python `fastapi` `backend` service, with
top-level `rewrites` routing `/api/*` to the backend and everything else to
the studio.

```bash
vercel deploy --prod
```

**Environment variables (Vercel dashboard — do not commit secrets):**

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `GROQ_API_KEY` | Optional | Live LLM runs (default `CHAT_PROVIDER=stub` in `vercel.json`) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Optional | Supabase Storage backend + studio OAuth |
| `BLOB_READ_WRITE_TOKEN` | Recommended if not using Supabase | Injected by `vercel blob create-store` |
| `OBJECT_STORE_BUCKET` / `OBJECT_STORE_ENDPOINT` / `OBJECT_STORE_ACCESS_KEY_ID` / `OBJECT_STORE_SECRET_ACCESS_KEY` / `OBJECT_STORE_REGION` | S3-compatible alternative | Cloudflare R2, AWS S3, MinIO, Azure Blob S3 API |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Optional alternative | Turso libsql — ignored when Supabase, Blob, or object store is set |
| `LANGFUSE_*` | Optional | Telemetry tracing — noop when unset |

`vercel.json` sets `GRAPH_DB_PATH=/tmp/graphs.db` for ephemeral per-isolate
SQLite when none of the above storage backends are configured.

## Deliberate simplifications vs. the full EDD

Everything here is a scoped-down stand-in for a real platform concept, kept
swappable behind the same seams the original EDD (`agent_orchestration_edd.md`)
specifies:

| Choice here | EDD target | Swap point |
|---|---|---|
| SQLite locally; Supabase / Vercel Blob / S3-compatible / Turso in production | Supabase PostgreSQL + immutable run store | `storage.py` |
| In-memory live runs + SSE buses | Durable checkpoints + replay | `runtime.py` (`RUN_STORE`, `RUN_BUSES`) |
| Supabase OAuth is opt-in, fails open (no gate when unconfigured) | Supabase Auth + RLS + org/project hierarchy | `apps/studio/lib/supabase/`, `middleware.ts` |
| Stub, Groq, Google, Azure, Ollama, OpenAI-compatible adapters | Ollama (dev) + Azure OpenAI (prod), adapter-selected | `providers/` |
| 12 node types, 3 edge kinds, no loops | Full node taxonomy incl. memory/parallel, 8 edge kinds | `models.py` |
| No entity versioning/immutability | Versioned agents/prompts/tools/models with lifecycle states | `models.py` (`GraphNode.config` is inline, not a `definitionRef`) |
| GenUI action dispatch is inert (`console.info`, not wired) | Live GenUI action handling | `genui-renderer.tsx` |

None of these are accidents — they're the "don't build the platform in
miniature" boundary the original POC spec set, now inherited by the
consolidated studio. The seams (`ChatModel` protocol,
`ExecutionRuntime`-shaped compile/execute split, internal event protocol)
are the same ones the EDD calls out as the durable architecture; only their
backing implementations are simplified.
