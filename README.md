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
   (`backend/app/providers/base.py`); today it's backed by Ollama
   (`providers/ollama.py`), and swapping in another provider means adding an
   adapter, not touching the compiler or node executors.
4. **Execution is observable at the node level** — every node emits
   `node.started` / `node.completed` / `node.failed` events over SSE, and the
   UI's node-trace panel shows the exact input/output payload for any node
   you click, live or after the run.

## Stack

- **Backend**: Python + FastAPI + LangGraph, `uv` for dependency management.
- **Frontend**: Vite + React + TypeScript + `@xyflow/react` (React Flow).
- **Model provider**: Ollama (local), via a provider-neutral interface.
- **Persistence**: SQLite for saved graph definitions. Runs are in-memory
  only (no durable execution in this POC — see Simplifications below).

## Running it

Prerequisites: Python 3.11+, `uv`, Node 18+, and a local
[Ollama](https://ollama.com) instance with a model pulled (defaults to
`qwen2.5:3b`; override per-node in the LLM node's config).

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

Open http://localhost:5173 — the canonical demo graph loads automatically
(seeded into `backend/graphs.db` on first backend startup). Click **Run**,
inspect the live event log and node traces, then try editing a node's
prompt/model, adding a node from the palette, or changing an edge's
condition and re-running.

`backend/smoke_test.py` is a standalone script (`uv run python
smoke_test.py`) that compiles and executes the demo graph twice — once with
a technical question, once without — printing the full event stream, useful
for verifying the backend without the UI.

## Deliberate simplifications vs. the full EDD

Everything here is a scoped-down stand-in for a real platform concept, kept
swappable behind the same seams the EDD specifies:

| POC choice | EDD target | Swap point |
|---|---|---|
| SQLite for graph definitions | Supabase PostgreSQL | `storage.py` |
| In-memory run/event state | Immutable run snapshots + durable checkpoints | `runtime.py` (`RUN_STORE`, `RUN_TRACES`) |
| No auth, no multi-tenancy, no Next.js BFF | Supabase Auth + RLS + org/project hierarchy + BFF | frontend talks directly to FastAPI |
| Ollama only | Ollama (dev) + Azure AI Foundry (prod), adapter-selected | `providers/` |
| 6 node types, 3 edge kinds, no loops | Full node taxonomy incl. memory/RAG/approval/parallel, 8 edge kinds | `models.py` |
| No entity versioning/immutability | Versioned agents/prompts/tools/models with lifecycle states | `models.py` (`GraphNode.config` is inline, not a `definitionRef`) |
| No replay, no approvals, no MCP | Sections 22-25 of the EDD | out of scope per POC spec |

None of these are accidents — they're the "don't build the platform in
miniature" boundary from the POC spec. The seams (`ChatModel` protocol,
`ExecutionRuntime`-shaped compile/execute split, internal event protocol)
are the same ones the EDD calls out as the durable architecture; only their
backing implementations are simplified.
