---
title: Hybrid retrieval — BM25 + vector fusion with rerank
last_updated: 2026-10-04
---

# Hybrid retrieval plan

**Status:** planned (2026-10-04). Independent of the extraction node; can run in parallel.

## Why

Retrieval today is pure vector cosine similarity (`backend/app/knowledge.py`: `top_k_chunks_by_embedding`). Pure-vector misses exact-term matches (IDs, names, error codes) and has no rerank stage. The practice repo proved reranking and pgvector separately but never shipped hybrid fusion. This closes that gap inside the shipped platform.

## Decisions (2026-10-04, proposed — need Brandon's sign-off)

- **BM25 library:** `rank-bm25` first (pure Python, zero native deps). Swap to tantivy only on profiling evidence.
- **Fusion:** reciprocal-rank fusion (RRF, k=60) of BM25 and vector rankings. No learned weights to tune; one less thing to overfit.
- **Reranker:** cross-encoder (local, deterministic, cheap) over LLM-judge. Top-k → top-n in the same request path.
- **Eval before code:** build the labeled query set first, record the pure-vector baseline, then tune blind-free.

## Backend (`backend/app/knowledge.py` et al.)

- **Index build:** at upload time, build a BM25 index over chunk texts alongside the vectors. Stored per graph in the knowledge entry (same durability story as embeddings; mixed-index guard already exists for embedding models — extend the mismatch check to the BM25 tokenizer version).
- **Retrieval path:** `top_k_chunks_hybrid(query, entry, ...)` —
  1. BM25 top-k and vector top-k (k=50 each),
  2. RRF fusion,
  3. cross-encoder rerank to top-n (n = requested limit).
- **Per-graph config:** new `RetrievalConfig` on the knowledge entry — `mode: vector | hybrid` (default `vector`, no behavior change on existing graphs), `rrf_k`, `rerank: bool`, `bm25_weight` (kept for future weighted fusion; RRF ignores it).
- **API:** retrieval settings on the existing knowledge routes; fusion weights and per-stage scores surfaced in the trace (lineage already exists — PR #148).
- **pgvector promotion:** move the per-graph index toward Supabase pgvector for production (the practice repo has the proof in `docker-compose.pgvector.yml`). BM25 stays local (small, per-graph).

## Studio

- **Knowledge panel** (`components/graph/KnowledgePanel.tsx`, `lib/knowledgePanel.ts`): retrieval mode segmented control, rerank toggle, advanced weights (collapsed).
- **Trace/lineage:** show fusion inputs (bm25 rank, vector rank, fused score) per hit — extends the lineage graph from #148.
- **KB article:** update `content/kb/knowledge-base-rag.md` with the hybrid mode; `pnpm kb` bundles.

## Testing

- **Eval set first:** fixed labeled query set (question → expected chunk ids) committed before the fusion code. Record pure-vector ndcg@k as the baseline.
- **CI:** retrieval eval runs on stub embeddings; asserts hybrid ndcg@k ≥ vector baseline and p95 latency within budget.
- **Studio:** typecheck, eslint, knowledge panel tests.

## Acceptance

- Hybrid beats pure-vector ndcg@k on the eval set with no latency regression.
- Existing graphs are unaffected (default mode `vector`).
- Per-graph retrieval config persists, replays deterministically, and is visible in lineage.

## Open questions

- Who labels the eval query set, and how big (50? 200?)?
- Cross-encoder model choice: which one, and where does it run (backend container vs sidecar)?
- Should hybrid become the default for new graphs after the eval proves it?
