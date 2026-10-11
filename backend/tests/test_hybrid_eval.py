"""Hybrid-retrieval eval harness: pure-vector baseline vs BM25+RRF hybrid.

Runs a labeled query set through BOTH retrieval paths and reports
ndcg@5 / ndcg@10 by query type plus p95 latency, side by side. The hybrid
column (Phase 1) fuses BM25 (rank-bm25) and vector top-50s with RRF (k=60)
behind a per-graph ``retrieval.mode="hybrid"`` flag; the vector column is
the shipped default path, unchanged.

Two eval sets share this harness:

* ``public``: the committed synthetic corpus under fixtures/hybrid_eval/
  (invented games, safe to publish). Always runs; this is the CI gate.
* ``private``: real rulebooks kept outside the repo. Runs only when
  ``HYBRID_EVAL_DIR`` points at a directory with the same layout
  (rulebooks/*.md, hybrid_eval.jsonl, hybrid_eval_vectors.json); skipped
  otherwise. NEVER commit a private set to this public repo.

Embeddings are real (local Ollama nomic-embed-text), embedded once and cached
in each set's hybrid_eval_vectors.json, so runs are offline and deterministic.
Regenerate with ``python scripts/build_hybrid_eval_vectors.py [--dir PATH]``.

Run with ``pytest tests/test_hybrid_eval.py -s`` to see the reports.
"""

from __future__ import annotations

import json
import math
import os
import time
from collections import defaultdict
from collections.abc import Callable
from pathlib import Path

import pytest

from app import storage
from app.embedding_model import ResolvedEmbeddingModel
from app.knowledge import (
    SCORE_THRESHOLD,
    TOP_K,
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeEntry,
    RetrievalConfig,
    retrieve_knowledge,
    top_k_chunks_by_embedding,
    top_k_chunks_hybrid,
)
from scripts.build_hybrid_eval_vectors import (
    PUBLIC_EVAL_DIR,
    VECTORS_FILE,
    load_corpus,
    load_eval_queries,
)

QUERY_TYPES = ("exact", "semantic", "adversarial")
LATENCY_REPS = 5
PRIVATE_ENV = "HYBRID_EVAL_DIR"


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


@pytest.fixture(
    scope="module",
    params=[
        "public",
        pytest.param(
            "private",
            marks=pytest.mark.skipif(
                not os.environ.get(PRIVATE_ENV), reason=f"{PRIVATE_ENV} not set (private set)"
            ),
        ),
    ],
)
def eval_dir(request: pytest.FixtureRequest) -> Path:
    if request.param == "public":
        return PUBLIC_EVAL_DIR
    return Path(os.environ[PRIVATE_ENV])


@pytest.fixture(scope="module")
def eval_queries(eval_dir: Path) -> list[dict]:
    return load_eval_queries(eval_dir)


@pytest.fixture(scope="module")
def vectors(eval_dir: Path) -> dict:
    return json.loads((eval_dir / VECTORS_FILE).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def chunks(eval_dir: Path, vectors: dict) -> list[KnowledgeChunk]:
    return [
        KnowledgeChunk(id=cid, document_id="corpus", text=text, vector=vectors["chunks"][cid])
        for cid, text in load_corpus(eval_dir)
    ]


# --- eval-set integrity ----------------------------------------------------


def test_eval_set_size_and_mix(eval_queries: list[dict]) -> None:
    assert 50 <= len(eval_queries) <= 75
    counts = {t: sum(q["query_type"] == t for q in eval_queries) for t in QUERY_TYPES}
    assert all(counts.values()), counts
    assert sum(counts.values()) == len(eval_queries)


def test_expected_chunk_ids_exist_in_chunker_output(
    eval_dir: Path, eval_queries: list[dict]
) -> None:
    """Every label points at a chunk the real chunker produces from the corpus."""
    real_ids = {cid for cid, _ in load_corpus(eval_dir)}
    for q in eval_queries:
        assert q["expected_chunk_ids"], q["query"]
        assert set(q["expected_chunk_ids"]) <= real_ids, q["query"]


def test_cached_vectors_match_corpus_and_queries(
    eval_dir: Path, vectors: dict, eval_queries: list[dict]
) -> None:
    """Stale vectors (corpus, chunker or query edits) fail loudly, not silently."""
    assert set(vectors["chunks"]) == {cid for cid, _ in load_corpus(eval_dir)}
    assert set(vectors["queries"]) == {q["query"] for q in eval_queries}


# --- ranking functions -----------------------------------------------------


def _make_rank_vector(
    chunks: list[KnowledgeChunk],
) -> Callable[[str, list[float], int], list[str]]:
    def _rank(query: str, query_vec: list[float], k: int) -> list[str]:
        hits = top_k_chunks_by_embedding(query_vec, chunks, {"corpus": "corpus"}, k)
        return [h["chunkId"] for h in hits]

    return _rank


def _make_rank_hybrid(
    chunks: list[KnowledgeChunk],
) -> Callable[[str, list[float], int], list[str]]:
    entry = KnowledgeEntry(
        id="hybrid_eval_graph",
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
        retrieval=RetrievalConfig(mode="hybrid"),
    )

    def _rank(query: str, query_vec: list[float], k: int) -> list[str]:
        return [h["chunkId"] for h in top_k_chunks_hybrid(query, query_vec, entry, k)]

    return _rank


# --- measurement -----------------------------------------------------------


def measure_baseline(
    eval_queries: list[dict],
    vectors: dict,
    chunks: list[KnowledgeChunk],
    rank_fn: Callable[[str, list[float], int], list[str]],
) -> dict:
    scores: dict[str, dict[int, list[float]]] = defaultdict(lambda: {5: [], 10: []})
    latencies_ms: list[float] = []
    per_query: list[dict] = []
    for q in eval_queries:
        qvec = vectors["queries"][q["query"]]
        relevant = set(q["expected_chunk_ids"])
        for _ in range(LATENCY_REPS):
            started = time.perf_counter()
            ranked = rank_fn(q["query"], qvec, 10)
            latencies_ms.append((time.perf_counter() - started) * 1000)
        ndcg5 = ndcg_at_k(ranked, relevant, 5)
        per_query.append({"query": q["query"], "query_type": q["query_type"], "ndcg5": ndcg5})
        for k in (5, 10):
            for bucket in (q["query_type"], "all"):
                scores[bucket][k].append(ndcg_at_k(ranked, relevant, k))

    def mean(xs: list[float]) -> float:
        return sum(xs) / len(xs)

    return {
        "model": vectors["model"],
        "queries": len(eval_queries),
        "chunks": len(chunks),
        "ndcg": {b: {k: round(mean(v), 4) for k, v in by_k.items()} for b, by_k in scores.items()},
        "p95_ms": round(percentile(latencies_ms, 95), 3),
        "per_query": per_query,
    }


def test_pure_vector_baseline(
    eval_dir: Path, eval_queries: list[dict], vectors: dict, chunks: list[KnowledgeChunk]
) -> None:
    report = measure_baseline(eval_queries, vectors, chunks, _make_rank_vector(chunks))
    print(f"\nPURE-VECTOR BASELINE [{eval_dir.name}]", json.dumps(report, indent=2))
    for bucket in (*QUERY_TYPES, "all"):
        for k in (5, 10):
            assert 0.0 <= report["ndcg"][bucket][k] <= 1.0
    # A broken embedding cache or label set collapses ndcg toward chance (~0.1
    # on ~50 chunks); a working vector path clears this floor by a wide margin.
    assert report["ndcg"]["all"][10] > 0.5
    # Loose ceiling (CI noise): a brute-force cosine scan over ~50 chunks.
    assert report["p95_ms"] < 250


# --- hybrid column ---------------------------------------------------------


def _printable(report: dict) -> dict:
    return {k: v for k, v in report.items() if k != "per_query"}


def test_hybrid_matches_or_beats_vector(
    eval_dir: Path, eval_queries: list[dict], vectors: dict, chunks: list[KnowledgeChunk]
) -> None:
    vector_report = measure_baseline(eval_queries, vectors, chunks, _make_rank_vector(chunks))
    hybrid_report = measure_baseline(eval_queries, vectors, chunks, _make_rank_hybrid(chunks))

    v_ndcg, h_ndcg = vector_report["ndcg"], hybrid_report["ndcg"]
    deltas = {
        bucket: {k: round(h_ndcg[bucket][k] - v_ndcg[bucket][k], 4) for k in (5, 10)}
        for bucket in (*QUERY_TYPES, "all")
    }
    v_by_q = {p["query"]: p["ndcg5"] for p in vector_report["per_query"]}
    worse = sorted(
        (
            {
                "query": p["query"],
                "query_type": p["query_type"],
                "vector_ndcg5": round(v_by_q[p["query"]], 4),
                "hybrid_ndcg5": round(p["ndcg5"], 4),
                "delta": round(p["ndcg5"] - v_by_q[p["query"]], 4),
            }
            for p in hybrid_report["per_query"]
            if p["ndcg5"] < v_by_q[p["query"]]
        ),
        key=lambda row: row["delta"],
    )
    print(f"\nHYBRID vs VECTOR [{eval_dir.name}]")
    print("vector:", json.dumps(_printable(vector_report), indent=2))
    print("hybrid:", json.dumps(_printable(hybrid_report), indent=2))
    print("deltas (hybrid - vector):", json.dumps(deltas, indent=2))
    print(f"queries where hybrid ranks worse than vector (ndcg@5): {len(worse)}")
    for row in worse:
        print(f"  {row['delta']:+.4f} [{row['query_type']}] {row['query']!r}")

    # Hybrid must not regress the set's own vector baseline, measured in the
    # same run (never hard-code the private set's numbers in this repo).
    assert h_ndcg["all"][5] >= v_ndcg["all"][5]
    for bucket in QUERY_TYPES:
        assert h_ndcg[bucket][5] >= v_ndcg[bucket][5] - 0.02, bucket
    # The BM25 leg + RRF must stay cheap: at most 3x the cosine scan, and
    # under the same 250 ms ceiling as the vector path.
    assert hybrid_report["p95_ms"] <= 3 * vector_report["p95_ms"]
    assert hybrid_report["p95_ms"] < 250


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
