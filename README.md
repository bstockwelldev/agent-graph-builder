# Agent Graph Builder

Build an agent workflow as a graph, run it, and inspect every node's input and
output. Agent Graph Builder is a Next.js **Studio** (`apps/studio`), a
FastAPI + [LangGraph](https://github.com/langchain-ai/langgraph) execution API
(`backend/`), and a typed TypeScript SDK published as
[`@bstockwelldev/agent-graph-sdk`](packages/agent-graph-sdk/README.md) (1.0.0 on npm).

## Try it

**Live:** https://agent-graph-builder-app.vercel.app

No sign-up or API key needed. The Run panel defaults to the **Stub (offline)**
provider, a deterministic stand-in model that needs no key.

1. Open **Classify & Route (demo)** from the Graphs page.
2. Press **Run** in the bottom bar, then **Run** in the panel. The sample
   question ("How does a database index work?") is already filled in.
3. Click any node on the canvas, then its **Run** tab, to see the exact input
   and output from that node in the last run. The router shows which edge it picked.

The demo classifies a question as `technical` or `other` and then routes it.
Technical questions go to a deterministic tool lookup. Everything else goes to
a free-form LLM answer. Ask something non-technical to see the other branch run.

## What the Studio does

- **Author graphs visually:** React Flow canvas, a node palette, per-type config
  forms, typed ports with compatible-target hints, and live validation that
  marks problems on nodes and edges. A raw JSON/YAML editor covers everything
  the forms don't.
- **Run and debug:** runs stream node events live. The Studio also has a run
  waterfall, run history, and a console drawer, and clicking a diagnostic
  jumps to the node or edge it's about.
- **Release and replay:** publish immutable releases, diff a release against
  another release or the unsaved canvas, and replay a past run. You can replay
  it frozen, or as a counterfactual (force a different route, or swap an LLM
  node's provider or model).
- **Supporting surfaces:** a per-graph knowledge base (RAG), versioned reusable
  resources (prompts, tools, LLM profiles, policies), fixture-based simulation,
  a chat scratchpad, and usage/spend analytics.

### Node vocabulary

The backend defines 13 `NodeType`s (`backend/app/models.py`), and the palette
can add all of them:

| Node | What it does |
| --- | --- |
| `input` | Defines a run variable (default `question`) and is the graph's entry point |
| `prompt` | Renders a text template from graph state |
| `llm` | Calls a chat model through the provider-neutral `ChatModel` protocol |
| `tool` | Runs a tool (built-in `lookup_topic`, or MCP) |
| `router` | Picks exactly one outgoing edge |
| `branch` | Substring gate with its own conditional and default out-edges |
| `tool_loop` | Multi-step tool-calling agent, capped at a configured number of steps |
| `guardrail` | Input-safety checks (length, URLs, injection phrases); fails the run on a violation |
| `rubric` | Static prompt-quality findings; can block the run |
| `human_gate` | Pauses the run for approval; resume or reject with `POST /api/runs/{id}/resume` |
| `subgraph` | Runs another saved graph as a nested run with its own trace |
| `code_exec` | Declares a code-execution contract (validated and passed through; no sandbox yet) |
| `output` | Returns the run result |

There are three edge kinds: `sequence` (always), `conditional` (match upstream
text), and `default` (the router's fallback).

### Model providers

Providers are chosen per run in the Run panel, or with `provider` on
`POST /api/runs`. The adapters live in `backend/app/providers/`.

| Provider | Use it for | Needs |
| --- | --- | --- |
| **Stub** | Demos, CI, offline development | Nothing (Studio default) |
| **Groq** | Hosted open-weight models | `GROQ_API_KEY` |
| **Google Gemini** | Gemini via the Generative Language API | `GOOGLE_GENAI_API_KEY` or `GOOGLE_API_KEY` |
| **Azure OpenAI** | An Azure deployment | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT_NAME` |
| **Ollama** | Local models | Ollama running on the host (default model `qwen2.5:3b`) |
| **OpenAI-compatible** | OpenAI, OpenRouter, LM Studio, vLLM | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_DEFAULT_MODEL` |

Stub classifies with the same keywords as the demo's tool node. Other LLM nodes
get a deterministic `[stub answer] …` string. The variable names are listed in
[`backend/env.template`](backend/env.template).

## How it works: the seams

The Studio is not a hard-coded pipeline with a canvas on top. Three seams keep
authoring, execution, and model choice independent:

1. **Execution follows the graph.** `compile_workflow` in
   `backend/app/runtime.py` compiles the canonical graph JSON into a real
   LangGraph `StateGraph`: one `add_node`/`add_edge` call per node and edge
   in the document. There is no `if/else` chain describing "the" workflow.
   Add a node in the editor and the runtime takes a different path.
   `backend/app/adapters.py` wraps this as a `RuntimeAdapter` with an explicit
   capability matrix, so LangGraph is the first compile target, not the only
   possible one.
2. **Models are behind a protocol.** LLM nodes call the `ChatModel` protocol
   (`backend/app/providers/base.py`), a single async `generate(...)` method.
   Adding a provider means adding an adapter. The compiler and node
   executors don't change.
3. **Execution is observable per node.** Every node emits events from a
   typed protocol (`backend/app/events.py`): `node.started`,
   `node.completed`, `node.failed`, `node.paused`, and `edge.selected`,
   between `run.started` and `run.completed`/`run.failed`/`run.paused`.
   Events stream over SSE (resumable with `Last-Event-ID`) and are
   snapshotted with each run's node traces. The Studio's trace view, the
   waterfall, and replay all read from this protocol.

## Run it locally

### Bare metal

Prerequisites: Node 20+, pnpm 10 (`corepack enable` picks up the pinned
version), Python 3.11+, and [`uv`](https://docs.astral.sh/uv/).

Backend (terminal 1):

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Studio (terminal 2, from the repo root):

```bash
pnpm install
pnpm run build:sdk
pnpm dev
```

Open http://localhost:3000. The Studio proxies `/api/*` to
`http://127.0.0.1:8000` (override with `API_PROXY_TARGET`). The demo graph is
seeded on first backend start, and graphs persist to `backend/graphs.db`
(SQLite; override with `GRAPH_DB_PATH`).

### Docker

```bash
docker compose up --build
```

This starts the Studio on http://localhost:3000 and the API on
http://localhost:8000, both with hot reload from bind-mounted source. Saved
graphs live in the `graph_db` volume. `docker compose down` keeps it, and
`down -v` drops it. Ollama isn't containerized on purpose: the backend reaches
the host's Ollama at `http://host.docker.internal:11434`, so it reuses models
you've already pulled.

`scripts/dev.ps1 up` (PowerShell) and `scripts/dev.sh up` (bash) wrap the same
compose commands, with `-d`, `down`, and `down -v`.

### Keys

Put provider keys in `backend/.env.local` (gitignored), or point
`SHARED_ENV_FILE` at a dotenv file. Keys already in the environment are never
overwritten. Without any keys, everything runs on Stub.

## Tests

```bash
# Backend (uses the Stub provider; no keys or Ollama needed)
cd backend
uv sync --extra dev
uv run pytest
```

Backend tests currently write their fixture graphs into the dev database
(`backend/graphs.db`). Delete that file afterwards if you want a library that
contains only the demo.

```bash
# SDK build + SDK and Studio tests (from the repo root)
pnpm test
```

Backend smoke run of the demo graph, printing the full event stream:

```bash
cd backend
CHAT_PROVIDER=stub uv run python smoke_test.py
```

CI (`.github/workflows/ci.yml`) runs backend pytest, Studio
lint/typecheck/test/build, and SDK package checks on every push and PR. The
SDK is released manually with the **Release SDK** workflow. See
[`AGENTS.md`](AGENTS.md) for the changeset and OpenAPI-contract steps.

## Deploy (Vercel)

Production is https://agent-graph-builder-app.vercel.app. `vercel.json`
deploys the Studio and the FastAPI backend as two services, with `/api/*`
routed to the backend. Health check: `GET /api/health` returns
`{"ok":true,"storage_backend":"supabase", ...}`.

```bash
vercel deploy --prod
```

Set these in the Vercel dashboard. Never commit them.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Yes (prod) | Durable storage in Supabase Storage |
| `SUPABASE_STORAGE_BUCKET` | Optional | Private bucket; default `agent-graph-builder` |
| `OBJECT_STORE_BUCKET`, `OBJECT_STORE_ACCESS_KEY_ID`, `OBJECT_STORE_SECRET_ACCESS_KEY` | Alternative | S3-compatible store (R2, S3, MinIO, Azure S3 API) |
| `OBJECT_STORE_ENDPOINT`, `OBJECT_STORE_REGION` | Optional | Custom endpoint / region (`auto` for R2) |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Alternative | Turso libsql |
| `GROQ_API_KEY` | Optional | Live LLM runs (`CHAT_PROVIDER=stub` is the deployed default) |

Storage selection, first match wins: Supabase, then `OBJECT_STORE_*`, then
`TURSO_*`, then file SQLite. On Vercel with no shared store, the API returns
503 rather than write to a per-isolate `/tmp` database that would lose data.

Legacy aliases still resolve: `agent-graph-builder-poc.vercel.app` and
`theagenticengineer-graph-builder.vercel.app`. The bare
`agent-graph-builder.vercel.app` belongs to a different account.

## What shipped, and what's still simplified

This started as a thin proof of concept for the Provider-Neutral, Graph-Native
Agent Workstream Platform EDD (`agent_orchestration_edd.md`). Much of the EDD
has shipped since. The rest is still simplified on purpose, behind the same
seams, so each piece can be swapped without touching the others.

**Shipped:**

| EDD concept | Where it lives |
| --- | --- |
| Full node taxonomy: guardrails, rubric, human approval, tool loop, subgraphs, RAG | `models.py`, `nodes.py`, `knowledge.py`, `subgraphs.py` |
| Typed ports and contract/policy validation | `ports.py`, `contracts.py`, `policies.py` |
| Immutable, fingerprinted releases and semantic diffs | `releases.py`, `fingerprint.py` |
| Version-pinned run identity (`RunGraphSnapshot`) | `models.py`, `runtime.py` |
| Replay and counterfactual replay | `replay.py` |
| Versioned reusable entities (prompts, tools, LLM profiles) | `resource_versions.py` |
| Runtime adapter boundary with a capability matrix | `adapters.py` |
| Durable storage for graphs, releases, and completed runs | `storage.py`, `supabase_store.py`, `object_store.py` |
| Six provider adapters behind one protocol | `providers/` |
| MCP tools, telemetry (Langfuse, opt-in), usage analytics | `mcp/`, `telemetry/`, `analytics.py` |

**Still simplified:**

| Today | EDD target | Swap point |
| --- | --- | --- |
| `human_gate` pause checkpoints are in memory (`RUN_PAUSES`). A paused run's summary persists, but it can't be resumed after a process restart. | Durable checkpoints | `runtime.py` → a `storage.py` backend |
| Live runs and SSE event buses are in memory (`RUN_STORE`, `RUN_BUSES`). Completed runs persist, but in-flight streams are lost on restart, and on serverless a live stream exists only in the instance that started the run. | Durable run store with cross-instance streaming | `runtime.py`, `events.py` |
| No multi-tenancy. There's optional Studio sign-in, but no orgs or projects, no per-tenant isolation, and no RLS. Every graph is visible to every user of a deployment. | Supabase Auth + RLS + org/project hierarchy | `storage.py`, Studio middleware |
| Storage is a JSON document store (Supabase Storage, S3, Turso, or SQLite), not relational tables. | Supabase PostgreSQL | `storage.py` |
| `code_exec` declares a contract but has no sandbox executor. | Sandboxed execution | `nodes.py` |
| No per-node retry policy. | Retries with backoff, visible in the waterfall | `runtime.py`, `nodes.py` |

## More

- SDK: [`packages/agent-graph-sdk/README.md`](packages/agent-graph-sdk/README.md)
- Roadmap and feature specs: [`docs/planning/roadmap.md`](docs/planning/roadmap.md), [`docs/planning/features/`](docs/planning/features/)
- Contributor and agent notes: [`AGENTS.md`](AGENTS.md), [`apps/studio/AGENTS.md`](apps/studio/AGENTS.md)
