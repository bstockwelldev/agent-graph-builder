"""Hybrid-retrieval eval harness, Phase 0: pure-vector baseline.

Runs the labeled query set (fixtures/hybrid_eval.jsonl) through the CURRENT
retrieval path and reports ndcg@5 / ndcg@10 by query type plus p95 latency.
No fusion code lives here: Phase 1 adds a hybrid column next to this one.

Embeddings are real (local Ollama nomic-embed-text), embedded once and cached
in fixtures/hybrid_eval_vectors.json, so the run is offline and deterministic.
Regenerate with ``python scripts/build_hybrid_eval_vectors.py``.

Run with ``pytest tests/test_hybrid_eval.py -s`` to see the report.
"""

from __future__ import annotations

import json
import math
import time
from collections import defaultdict
from pathlib import Path

import pytest

from app import knowledge, storage
from app.embedding_model import ResolvedEmbeddingModel
from app.knowledge import (
    SCORE_THRESHOLD,
    TOP_K,
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeEntry,
    retrieve_knowledge,
    top_k_chunks_by_embedding,
)
from scripts.build_hybrid_eval_vectors import load_corpus

FIXTURES = Path(__file__).parent / "fixtures"
QUERY_TYPES = ("exact", "semantic", "adversarial")
LATENCY_REPS = 5


# --- metrics ---------------------------------------------------------------


def ndcg_at_k(ranked_ids: list[str], relevant: set[str], k: int) -> float:
    """Binary-relevance ndcg: DCG of the top-k over the DCG of an ideal ranking."""
    dcg = sum(
        1.0 / math.log2(rank + 1) for rank, cid in enumerate(ranked_ids[:k], 1) if cid in relevant
    )
    ideal = sum(1.0 / math.log2(rank + 1) for rank in range(1, min(k, len(relevant)) + 1))
    return dcg / ideal if ideal else 0.0


def percentile(values: list[float], pct: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(pct / 100 * len(ordered)) - 1)]


# --- fixtures --------------------------------------------------------------


def _load_queries() -> list[dict]:
    lines = (FIXTURES / "hybrid_eval.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(ln) for ln in lines if ln.strip() and not ln.startswith("#")]


@pytest.fixture(scope="module")
def eval_queries() -> list[dict]:
    return _load_queries()


@pytest.fixture(scope="module")
def vectors() -> dict:
    return json.loads((FIXTURES / "hybrid_eval_vectors.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def chunks(vectors: dict) -> list[KnowledgeChunk]:
    return [
        KnowledgeChunk(id=cid, document_id="corpus", text=text, vector=vectors["chunks"][cid])
        for cid, text in load_corpus()
    ]


# --- eval-set integrity ----------------------------------------------------


def test_eval_set_size_and_mix(eval_queries: list[dict]) -> None:
    assert 50 <= len(eval_queries) <= 75
    counts = {t: sum(q["query_type"] == t for q in eval_queries) for t in QUERY_TYPES}
    assert all(counts.values()), counts
    assert sum(counts.values()) == len(eval_queries)


def test_expected_chunk_ids_exist_in_chunker_output(eval_queries: list[dict]) -> None:
    """Every label points at a chunk the real chunker produces from the corpus."""
    real_ids = {cid for cid, _ in load_corpus()}
    for q in eval_queries:
        assert q["expected_chunk_ids"], q["query"]
        assert set(q["expected_chunk_ids"]) <= real_ids, q["query"]


def test_cached_vectors_match_corpus_and_queries(vectors: dict, eval_queries: list[dict]) -> None:
    """Stale vectors (corpus, chunker or query edits) fail loudly, not silently."""
    assert set(vectors["chunks"]) == {cid for cid, _ in load_corpus()}
    assert set(vectors["queries"]) == {q["query"] for q in eval_queries}


# --- baseline --------------------------------------------------------------


def _rank(query_vec: list[float], chunks: list[KnowledgeChunk], k: int) -> list[str]:
    hits = top_k_chunks_by_embedding(query_vec, chunks, {"corpus": "corpus"}, k)
    return [h["chunkId"] for h in hits]


def measure_baseline(eval_queries: list[dict], vectors: dict, chunks: list[KnowledgeChunk]) -> dict:
    scores: dict[str, dict[int, list[float]]] = defaultdict(lambda: {5: [], 10: []})
    latencies_ms: list[float] = []
    for q in eval_queries:
        qvec = vectors["queries"][q["query"]]
        relevant = set(q["expected_chunk_ids"])
        for _ in range(LATENCY_REPS):
            started = time.perf_counter()
            ranked = _rank(qvec, chunks, 10)
            latencies_ms.append((time.perf_counter() - started) * 1000)
        for k in (5, 10):
            for bucket in (q["query_type"], "all"):
                scores[bucket][k].append(ndcg_at_k(ranked, relevant, k))
    mean = lambda xs: sum(xs) / len(xs)  # noqa: E731
    return {
        "model": vectors["model"],
        "queries": len(eval_queries),
        "chunks": len(chunks),
        "ndcg": {b: {k: round(mean(v), 4) for k, v in by_k.items()} for b, by_k in scores.items()},
        "p95_ms": round(percentile(latencies_ms, 95), 3),
    }


def test_pure_vector_baseline(
    eval_queries: list[dict], vectors: dict, chunks: list[KnowledgeChunk]
) -> None:
    report = measure_baseline(eval_queries, vectors, chunks)
    print("\nPURE-VECTOR BASELINE", json.dumps(report, indent=2))
    for bucket in (*QUERY_TYPES, "all"):
        for k in (5, 10):
            assert 0.0 <= report["ndcg"][bucket][k] <= 1.0
    # A broken embedding cache or label set collapses ndcg toward chance (~0.1
    # on 56 chunks); a working vector path clears this floor by a wide margin.
    assert report["ndcg"]["all"][10] > 0.5
    # Loose ceiling (CI noise): a brute-force cosine scan over 56 chunks, p95 ~17 ms locally.
    assert report["p95_ms"] < 250


# --- the harness measures the shipped path, not just its inner function ----


async def test_retrieve_knowledge_matches_harness_ranking(
    monkeypatch: pytest.MonkeyPatch,
    eval_queries: list[dict],
    vectors: dict,
    chunks: list[KnowledgeChunk],
) -> None:
    """retrieve_knowledge (TOP_K, score threshold) returns the harness's top-k prefix."""
    graph_id = "hybrid_eval_graph"
    entry = KnowledgeEntry(
        id=graph_id,
        # Identity only: the real vectors are cached, embed_query is stubbed below.
        embedding_provider="openai",
        embedding_model_id="text-embedding-3-small",
        documents=[
            KnowledgeDocument(
                id="corpus",
                name="corpus",
                mime_type="text/markdown",
                uploaded_at="now",
                char_count=1,
            )
        ],
        chunks=chunks,
    )
    storage.save_resource("knowledge", graph_id, entry.model_dump())
    monkeypatch.setattr(
        "app.knowledge.resolve_embedding_model",
        lambda: ResolvedEmbeddingModel(
            provider="openai", model_id="text-embedding-3-small", api_key="sk-test"
        ),
    )
    current: dict[str, list[float]] = {}

    async def _cached_embed_query(resolution, query):
        return current["vec"]

    monkeypatch.setattr("app.knowledge.embed_query", _cached_embed_query)

    for q in eval_queries:
        current["vec"] = vectors["queries"][q["query"]]
        _, hits = await retrieve_knowledge("sys", graph_id, q["query"])
        expected = [
            h["chunkId"]
            for h in top_k_chunks_by_embedding(current["vec"], chunks, {}, TOP_K)
            if h["score"] > SCORE_THRESHOLD
        ]
        assert [h["chunkId"] for h in hits] == expected, q["query"]
    assert knowledge  # keep the module import honest for monkeypatch targets
