"""Unit tests for the hybrid-retrieval slice (Phase 1): tokenizer, BM25,
RRF fusion, RetrievalConfig back-compat, and the retrieve_knowledge
hybrid branch. All strings here are synthetic."""

from __future__ import annotations

import pytest

from app import storage
from app.embedding_model import ResolvedEmbeddingModel
from app.knowledge import (
    SCORE_THRESHOLD,
    TOKENIZER_VERSION,
    TOP_K,
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeEntry,
    RetrievalConfig,
    bm25_top_k,
    retrieve_knowledge,
    rrf_fuse,
    tokenize,
    top_k_chunks_by_embedding,
    top_k_chunks_hybrid,
)


def _chunks() -> list[KnowledgeChunk]:
    return [
        KnowledgeChunk(
            id=f"c{i}",
            document_id="d1",
            text=text,
            vector=vector,
        )
        for i, (text, vector) in enumerate(
            [
                ("The Iron-rimmed Wheels turn on the Salt Road.", [1.0, 0.0, 0.0]),
                ("Ghost Wagon haunts the Dunmarket crossing.", [0.0, 1.0, 0.0]),
                ("A T-Rex-style predator stalks the tall grass.", [0.0, 0.0, 1.0]),
                ("Permit Tiles: 12 per season, no exceptions.", [0.5, 0.5, 0.0]),
                ("| table | pipes | split | into | tokens |", [0.5, 0.0, 0.5]),
                ("The Queen's Silks sell for 3d6 coins.", [0.0, 0.5, 0.5]),
                ("ünïcodé naïve café tokens survive lowercasing.", [0.3, 0.3, 0.4]),
                ("Strength 6 Bandit demand: pay or fight.", [0.7, 0.2, 0.1]),
            ]
        )
    ]


def _entry(chunks: list[KnowledgeChunk], **kwargs) -> KnowledgeEntry:
    return KnowledgeEntry(
        id="hybrid_unit_graph",
        embedding_provider="openai",
        embedding_model_id="text-embedding-3-small",
        documents=[
            KnowledgeDocument(
                id="d1",
                name="doc",
                mime_type="text/markdown",
                uploaded_at="now",
                char_count=1,
            )
        ],
        chunks=chunks,
        **kwargs,
    )


# --- tokenizer -----------------------------------------------------------


def test_tokenizer_version_is_pinned() -> None:
    assert isinstance(TOKENIZER_VERSION, int)


def test_tokenize_keeps_hyphenated_names() -> None:
    assert tokenize("Iron-rimmed Wheels") == ["iron-rimmed", "wheels"]
    assert tokenize("a T-Rex-style predator") == ["a", "t-rex-style", "predator"]


def test_tokenize_keeps_digits() -> None:
    assert tokenize("Strength 6 Bandit") == ["strength", "6", "bandit"]
    assert tokenize("roll 3d6") == ["roll", "3d6"]
    assert tokenize("Permit Tiles: 12") == ["permit", "tiles", "12"]


def test_tokenize_splits_pipes_and_escapes() -> None:
    assert tokenize("| table | pipes |") == ["table", "pipes"]
    assert tokenize(r"\*escaped\* stars") == ["escaped", "stars"]
    assert tokenize("The Queen's Silks") == ["the", "queen", "s", "silks"]


def test_tokenize_unicode() -> None:
    assert tokenize("ünïcodé naïve CAFÉ") == ["ünïcodé", "naïve", "café"]


def test_tokenize_empty() -> None:
    assert tokenize("") == []
    assert tokenize(" | * ") == []


# --- RRF -----------------------------------------------------------------


def test_rrf_fuse_orders_by_fused_score() -> None:
    fused = rrf_fuse([["a", "b", "c"], ["a", "b"]], k=60)
    assert [cid for cid, _ in fused] == ["a", "b", "c"]
    scores = dict(fused)
    assert scores["a"] > scores["b"] > scores["c"]


def test_rrf_fuse_tie_breaks_deterministically_by_id() -> None:
    # "a" and "b" have identical fused scores and identical best ranks;
    # the id is the final, deterministic tie-break.
    fused = rrf_fuse([["b", "a"], ["a", "b"]], k=60)
    assert [cid for cid, _ in fused] == ["a", "b"]
    assert fused[0][1] == fused[1][1]


def test_rrf_fuse_doc_present_in_only_one_list() -> None:
    fused = rrf_fuse([["a", "b"], ["c"]], k=60)
    assert [cid for cid, _ in fused] == ["a", "c", "b"]


def test_rrf_fuse_is_pure() -> None:
    rankings = [["a", "b"], ["b", "c"]]
    first = rrf_fuse(rankings)
    assert rrf_fuse(rankings) == first
    assert rankings == [["a", "b"], ["b", "c"]]


# --- BM25 ---------------------------------------------------------------


def test_bm25_top_k_ranks_exact_term_match_first() -> None:
    ranked = bm25_top_k("Iron-rimmed Wheels", _chunks(), k=3)
    assert ranked[0][0] == "c0"
    assert len(ranked) == 3
    assert all(isinstance(score, float) for _, score in ranked)


def test_bm25_top_k_empty_query_ranks_nothing() -> None:
    assert bm25_top_k(" | * ", _chunks()) == []
    assert bm25_top_k("wheels", []) == []


# --- hybrid top-k --------------------------------------------------------


def test_top_k_chunks_hybrid_hit_shape() -> None:
    chunks = _chunks()
    hits = top_k_chunks_hybrid("Iron-rimmed Wheels", [1.0, 0.0, 0.0], _entry(chunks), 5)
    assert len(hits) == 5
    for hit in hits:
        assert set(hit) >= {
            "chunkId",
            "documentId",
            "documentName",
            "text",
            "score",
            "bm25Rank",
            "vectorRank",
            "fusedScore",
        }
        assert isinstance(hit["fusedScore"], float)
    fused = [h["fusedScore"] for h in hits]
    assert fused == sorted(fused, reverse=True)


# --- RetrievalConfig back-compat -----------------------------------------


def test_old_shape_entry_loads_as_vector_mode() -> None:
    payload = _entry(_chunks()).model_dump()
    payload.pop("retrieval")
    entry = KnowledgeEntry.model_validate(payload)
    assert entry.retrieval == RetrievalConfig(mode="vector", rrf_k=60)


def test_retrieval_config_defaults() -> None:
    assert RetrievalConfig().mode == "vector"
    assert RetrievalConfig().rrf_k == 60


# --- retrieve_knowledge ----------------------------------------------------


def _stub_embedding(monkeypatch: pytest.MonkeyPatch, vec: list[float]) -> None:
    monkeypatch.setattr(
        "app.knowledge.resolve_embedding_model",
        lambda: ResolvedEmbeddingModel(
            provider="openai", model_id="text-embedding-3-small", api_key="sk-test"
        ),
    )

    async def _embed(resolution, query):
        return vec

    monkeypatch.setattr("app.knowledge.embed_query", _embed)


async def test_retrieve_knowledge_vector_mode_matches_old_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Default mode takes the pre-hybrid code path byte for byte: threshold
    applied, no fusion fields on the hits."""
    chunks = _chunks()
    entry = _entry(chunks)
    payload = entry.model_dump()
    payload.pop("retrieval")  # an entry saved before this change
    storage.save_resource("knowledge", entry.id, payload)
    vec = [1.0, 0.0, 0.0]
    _stub_embedding(monkeypatch, vec)

    _, hits = await retrieve_knowledge("sys", entry.id, "Iron-rimmed Wheels")

    names = {"d1": "doc"}
    expected = [
        {**hit, "rank": rank, "documentVersion": 1}
        for rank, hit in enumerate(
            (
                hit
                for hit in top_k_chunks_by_embedding(vec, chunks, names, TOP_K)
                if hit["score"] > SCORE_THRESHOLD
            ),
            start=1,
        )
    ]
    assert hits == expected
    assert all("bm25Rank" not in hit for hit in hits)


async def test_retrieve_knowledge_hybrid_mode_fuses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chunks = _chunks()
    entry = _entry(chunks, retrieval=RetrievalConfig(mode="hybrid"))
    storage.save_resource("knowledge", entry.id, entry.model_dump())
    _stub_embedding(monkeypatch, [1.0, 0.0, 0.0])

    _, hits = await retrieve_knowledge("sys", entry.id, "Iron-rimmed Wheels")

    # No cosine threshold in hybrid mode: the fused top TOP_K, all of them.
    assert len(hits) == TOP_K
    assert [h["rank"] for h in hits] == list(range(1, TOP_K + 1))
    for hit in hits:
        assert isinstance(hit["fusedScore"], float)
        assert hit["bm25Rank"] is None or isinstance(hit["bm25Rank"], int)
        assert hit["vectorRank"] is None or isinstance(hit["vectorRank"], int)
    fused = [h["fusedScore"] for h in hits]
    assert fused == sorted(fused, reverse=True)
