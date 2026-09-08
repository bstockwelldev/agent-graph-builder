# Agent Graph Builder — POC

A thin vertical slice proving the central thesis of the Provider-Neutral,
Graph-Native Agent Workstream Platform EDD (`agent_orchestration_edd.md`):

> A user can visually assemble a small graph, execute it, and inspect the
> execution path and outputs without writing agent orchestration code.

This is **not** the platform in miniature. It implements exactly six node
types (Input, Prompt, LLM, Tool, Router, Output) and three edge kinds
(Sequence, Conditional, Default), with one canonical demo workflow: classify
a question, then route to a deterministic tool lookup or a free-form LLM
answer.

## What this proves

1. **Graph authoring works visually** — React Flow canvas, node palette,
   per-type config forms, edge kind/condition editing.
2. **Execution follows the graph, not hard-coded orchestration** — the
   backend compiles the canonical graph JSON into a real
   [LangGraph](https://github.com/langchain-ai/langgraph) `StateGraph`
   (`backend/app/runtime.py`); there is no `if/else` chain describing "the"
   workflow anywhere in the runtime.
3. **Agent/model nodes are configured independently of the graph** — the LLM
   node calls a provider-neutral `ChatModel` protocol
   (`backend/app/providers/base.py`); adapters include **Stub** (offline),
   **Groq**, **Google Gemini**, **Ollama** (local), and **OpenAI-compatible
   HTTP** (OpenAI, OpenRouter, LM Studio, etc.). **Azure AI Foundry** is
   documented as a follow-up adapter only (see below). Swapping providers means
   adding an adapter, not touching the compiler or node executors.
4. **Execution is observable at the node level** — every node emits
   `node.started` / `node.completed` / `node.failed` events over SSE, and the
   UI's node-trace panel shows the exact input/output payload for any node
   you click, live or after the run.

## Stack

- **Backend**: Python + FastAPI + LangGraph, `uv` for dependency management.
- **Frontend**: Vite + React + TypeScript + `@xyflow/react` (React Flow).
- **Model provider**: Stub, Groq, Google Gemini, Ollama, or OpenAI-compatible
  HTTP; selected per run; factory in `backend/app/providers/base.py`. Azure
  (Foundry) planned — not implemented yet.
- **Persistence**: SQLite for saved graph definitions. Runs are in-memory
  only (no durable execution in this POC — see Simplifications below).

## Running it

### Option A: Docker (recommended)

Prerequisites: Docker Desktop. Ollama is optional — the UI defaults to
**Stub (offline)** so the demo runs without a local model. Switch to **Ollama
(local LLM)** in the Run panel when you have [Ollama](https://ollama.com)
running on the host with a model pulled (defaults to `qwen2.5:3b`).
Ollama itself is **not** containerized on purpose — it's kept on the host so
the containers reuse whatever models you've already pulled instead of
re-downloading them into a fresh container volume; the backend container
reaches it at `http://host.docker.internal:11434`.

```bash
docker compose up --build
```

- Backend: http://localhost:8000 (FastAPI + LangGraph, live-reloads on edits
  to `backend/app/`)
- Frontend: http://localhost:5173 (Vite dev server, live-reloads on edits to
  `frontend/src/`)
- Saved graphs persist in a named volume (`graph_db`) instead of a bare file,
  so `docker compose down` (without `-v`) keeps them across restarts.

Both services bind-mount their source directories, so the containers behave
exactly like the bare-metal dev servers below — same hot reload, same code —
just process-isolated. Stop with `docker compose down` (add `-v` to also
drop the saved-graphs volume).

If your Ollama instance is slow or under load from something else on the
host, LLM node calls can legitimately take a while; the provider adapter
uses a generous (180s) timeout rather than treating a slow local model as a
hard failure (`backend/app/providers/ollama.py`).

### Option B: bare metal

Prerequisites: Python 3.11+, `uv`, Node 18+. Ollama is only required when
you select **Ollama (local LLM)** in the Run panel (defaults to `qwen2.5:3b`;
override per-node in the LLM node's config).

```bash
# Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Either way

Open http://localhost:5173 — the canonical demo graph loads automatically
(seeded on first backend startup). Use the **Graph Library** in the left
sidebar to switch between saved graphs or create a new one (**Blank** starts
with input → output; **From demo** copies the classify-and-route workflow).
The Run panel defaults to **Stub (offline)** — click **Run** without Ollama,
inspect the live event log and node traces, then try **Ollama (local LLM)**
for real model output. Edit the graph name in the header (saved on
Compile/Run), edit nodes, or change edge conditions and re-run.

### Graph library

| Action | UI | API |
|---|---|---|
| List graphs | Left sidebar | `GET /api/graphs` |
| Open graph | Click a graph in the library | `GET /api/graphs/{id}` |
| Create graph | **New graph** form (blank or from demo) | `POST /api/graphs` `{ "name", "template": "blank" \| "demo" }` |
| Save edits | **Compile** or **Run** (also updates `updated_at`) | `PUT /api/graphs/{id}` |

Graph definitions persist in SQLite; switching graphs reloads from the server
(unsaved canvas edits are discarded unless you Compile/Run first).

### Compile-time validation (canvas UX)

The editor validates the **current canvas** as you edit (debounced, no save) via
`POST /api/graphs/validate`. Blocking issues appear on nodes and edges, in the
header validation chip, and in the Run panel diagnostics list — click an issue
to select the node or edge. **Compile** and **Run** still save first, then
compile against SQLite.

| Action | UI | API |
|---|---|---|
| Live validate while editing | Header chip + canvas marks | `POST /api/graphs/validate` `{ graph JSON }` |
| Save + compile | **Compile** | `PUT /api/graphs/{id}` then `POST /api/graphs/{id}/compile` |

### Run history

Completed runs are snapshotted to SQLite (summary + per-node traces). Live SSE
event streams stay in memory until a run finishes.

| Action | UI | API |
|---|---|---|
| List runs for graph | **Run history** in the right panel | `GET /api/graphs/{id}/runs` |
| Inspect a past run | Click a history entry | `GET /api/runs/{id}` + `GET /api/runs/{id}/nodes` |
| Live run | **Run** (streams events) | `POST /api/runs` + SSE `GET /api/runs/{id}/events` |

After a backend restart, past runs remain in the history list; only in-flight
SSE streams are lost.

### Model providers

| Provider | When to use | How to select |
|---|---|---|
| **Stub** | Offline demos, CI, fast routing proof | UI default; or `provider: "stub"`; or `CHAT_PROVIDER=stub` |
| **Groq** | Hosted Llama via Groq | UI **Groq**; or `provider: "groq"`; uses `GROQ_API_KEY` |
| **Google Gemini** | Gemini models via Generative Language API | UI **Google Gemini**; or `provider: "google"`; uses `GOOGLE_GENAI_API_KEY` or `GOOGLE_API_KEY` |
| **Ollama** | Real local LLM via Ollama | UI **Ollama (local LLM)**; or `provider: "ollama"`; or `CHAT_PROVIDER=ollama` (API default when omitted) |
| **OpenAI-compatible** | OpenAI, OpenRouter, LM Studio, vLLM, etc. | UI **OpenAI-compatible (HTTP)**; or `provider: "openai_compat"` |

Stub classifies using the same lookup keywords as the demo tool node; non-classifier LLM nodes return a short deterministic `[stub answer] …` string.

When an LLM node still has the demo default model (`qwen2.5:3b`), cloud providers automatically use their default model (or `AI_MODEL` when set) — matching tabletop-studio defaults (`llama-3.3-70b-versatile`, `gemini-2.5-flash`).

### Shared env with tabletop-studio

On backend startup the POC loads AI keys from a sibling repo dotenv file when present (never committed):

| Resolution | Path |
|---|---|
| `SHARED_ENV_FILE` | Explicit file path |
| `BSTOCKWELL_DEV_ROOT` | `<dev-root>/tabletop-studio/.env.local` |

Set `$env:BSTOCKWELL_DEV_ROOT` to your polyrepo root (the parent of `tabletop-studio` and this repo). Keys already in the process environment are **not** overwritten. See [`backend/env.template`](backend/env.template) and tabletop-studio [`env.template`](../tabletop-studio/env.template) for variable names (`GROQ_API_KEY`, `GOOGLE_GENAI_API_KEY`, `GOOGLE_API_KEY`, `AI_MODEL`, `AI_PROVIDER`).

```powershell
# From agent-graph-builder-poc (uses tabletop-studio/.env.local automatically)
$env:BSTOCKWELL_DEV_ROOT = "<dev-root>"
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_COMPAT_BASE_URL` | `https://api.openai.com/v1` | Chat completions base URL |
| `OPENAI_COMPAT_API_KEY` | *(empty)* | Bearer token; omit for local servers that skip auth |
| `OPENAI_COMPAT_DEFAULT_MODEL` | `gpt-4o-mini` | Used when an LLM node's config has no `model` |

Examples:

```bash
# OpenAI
set OPENAI_COMPAT_API_KEY=sk-...
set OPENAI_COMPAT_DEFAULT_MODEL=gpt-4o-mini

# LM Studio (local)
set OPENAI_COMPAT_BASE_URL=http://localhost:1234/v1
set OPENAI_COMPAT_DEFAULT_MODEL=your-loaded-model
```

Set each LLM node's **Model** field to the provider-specific model id (e.g.
`gpt-4o-mini` or `qwen2.5:3b`); the run-level provider selector chooses which
adapter handles the call.

### Planned follow-up: Azure provider

**Not implemented in this POC slice.** The full EDD targets **Azure AI Foundry**
(or Azure OpenAI) as the production adapter behind the same `ChatModel` seam
(`providers/`). When we add it, the work should mirror Groq/Google:

| Step | Target |
|---|---|
| Adapter | `backend/app/providers/azure.py` — chat completions against Azure deployment endpoint |
| Factory | `ChatProvider.AZURE`, `get_chat_model(..., provider="azure")` |
| API / UI | Extend `RunRequest.provider` and Run panel select |
| Config | Env vars loaded via existing `load_shared_env()` (same tabletop-studio `.env.local` path); do **not** hardcode `<dev-root>` paths in git |
| Tests | `pytest-httpx` mocks; no live Azure calls in CI |

**Expected env vars** (finalize against org / tabletop-studio when Azure lands
there; names may match Azure OpenAI SDK conventions):

| Variable | Purpose |
|---|---|
| `AZURE_OPENAI_API_KEY` | API key or token for the Azure resource |
| `AZURE_OPENAI_ENDPOINT` | Resource endpoint URL (e.g. `https://<resource>.openai.azure.com`) |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Deployment id used as the effective model for chat |
| `AZURE_OPENAI_API_VERSION` | API version query param (optional; adapter picks a sensible default) |

Foundry-specific endpoint/key names can be aliased in `env_config.py` once the
platform standard is fixed. Until then, use **OpenAI-compatible (HTTP)** with
`OPENAI_COMPAT_BASE_URL` pointed at an Azure OpenAI `/openai/v1`-compatible
base if you need Azure before the dedicated adapter exists.

### Verification

**Automated (no Ollama):**

```bash
cd backend
uv sync --extra dev
uv run pytest
```

Runs compile checks, router forks, graph-library, and durable run snapshot tests
using the stub provider (no Ollama).

**Manual backend smoke (requires Ollama):**

```bash
cd backend
uv run python smoke_test.py
```

Compiles and executes the demo graph twice — once with a technical question,
once without — printing the full event stream. Uses `CHAT_PROVIDER` (default
`ollama`); set `CHAT_PROVIDER=stub` for an offline run:

```bash
CHAT_PROVIDER=stub uv run python smoke_test.py
```

## Deliberate simplifications vs. the full EDD

Everything here is a scoped-down stand-in for a real platform concept, kept
swappable behind the same seams the EDD specifies:

| POC choice | EDD target | Swap point |
|---|---|---|
| SQLite for graphs + completed run snapshots | Supabase PostgreSQL + immutable run store | `storage.py` |
| In-memory live runs + SSE buses | Durable checkpoints + replay | `runtime.py` (`RUN_STORE`, `RUN_BUSES`) |
| No auth, no multi-tenancy, no Next.js BFF | Supabase Auth + RLS + org/project hierarchy + BFF | frontend talks directly to FastAPI |
| Stub, Groq, Google, Ollama, OpenAI-compatible adapters (**Azure pending**) | Ollama (dev) + Azure AI Foundry (prod), adapter-selected | `providers/` |
| 6 node types, 3 edge kinds, no loops | Full node taxonomy incl. memory/RAG/approval/parallel, 8 edge kinds | `models.py` |
| No entity versioning/immutability | Versioned agents/prompts/tools/models with lifecycle states | `models.py` (`GraphNode.config` is inline, not a `definitionRef`) |
| No replay, no approvals, no MCP | Sections 22-25 of the EDD | out of scope per POC spec |

None of these are accidents — they're the "don't build the platform in
miniature" boundary from the POC spec. The seams (`ChatModel` protocol,
`ExecutionRuntime`-shaped compile/execute split, internal event protocol)
are the same ones the EDD calls out as the durable architecture; only their
backing implementations are simplified.
