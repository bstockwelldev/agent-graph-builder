"""Per-graph knowledge base / RAG (studio-consolidation Phase 5 — see
docs/planning/features/studio-consolidation-plan.md and knowledge.py).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import knowledge, storage
from app.compiler import compile_graph
from app.demo_graph import build_demo_graph
from app.embedding_model import ResolvedEmbeddingModel
from app.knowledge import (
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeEntry,
    augment_system_with_knowledge,
    chunk_text,
    cosine_similarity,
    format_knowledge_augmentation,
    list_knowledge_lineage,
    top_k_chunks_by_embedding,
)
from app.main import app
from app.models import GraphDefinition, GraphNode, NodePosition, NodeType
from app.runtime import COMPILED_WORKFLOWS, start_run_inline

client = TestClient(app)


def _clear_embedding_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "OPENAI_API_KEY",
        "OPENAI_EMBEDDING_MODEL",
        "GOOGLE_GENERATIVE_AI_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_GENAI_API_KEY",
        "GOOGLE_API_KEY",
        "GOOGLE_EMBEDDING_MODEL",
    ):
        monkeypatch.delenv(name, raising=False)


# --- chunk_text --------------------------------------------------------


def test_chunk_text_empty_string_returns_no_chunks() -> None:
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_chunk_text_short_text_is_one_chunk() -> None:
    assert chunk_text("Hello world.") == ["Hello world."]


def test_chunk_text_long_text_splits_with_overlap() -> None:
    paragraph = "Kubernetes orchestrates containers. " * 60  # well over 900 chars
    pieces = chunk_text(paragraph, max_len=200, overlap=40)
    assert len(pieces) > 1
    assert all(len(p) <= 200 + 40 for p in pieces)  # boundary search stays near max_len
    # Every piece is non-empty text drawn from the source.
    assert all(p.strip() for p in pieces)


# --- cosine_similarity / top_k_chunks_by_embedding ----------------------


def test_cosine_similarity_identical_vectors_is_one() -> None:
    assert cosine_similarity([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) == pytest.approx(1.0)


def test_cosine_similarity_orthogonal_vectors_is_zero() -> None:
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_similarity_zero_vector_is_zero_not_nan() -> None:
    assert cosine_similarity([0.0, 0.0], [1.0, 1.0]) == 0.0


def test_top_k_chunks_orders_by_score_and_limits() -> None:
    # Cosine similarity is magnitude-invariant, so these differ by *angle*
    # from the query [1, 0], not by vector length.
    chunks = [
        KnowledgeChunk(id="c1", document_id="d1", text="orthogonal", vector=[0.0, 1.0]),
        KnowledgeChunk(id="c2", document_id="d1", text="exact match", vector=[1.0, 0.0]),
        KnowledgeChunk(id="c3", document_id="d1", text="close", vector=[1.0, 0.3]),
    ]
    hits = top_k_chunks_by_embedding([1.0, 0.0], chunks, {"d1": "doc.txt"}, k=2)
    assert [h["text"] for h in hits] == ["exact match", "close"]
    assert hits[0]["documentName"] == "doc.txt"
    # P2, "Retrieval/document lineage graph" — chunk/document ids travel
    # with the hit so a caller can record which chunk was actually used.
    assert hits[0]["chunkId"] == "c2"
    assert hits[0]["documentId"] == "d1"


def test_format_knowledge_augmentation_empty_hits_is_empty_string() -> None:
    assert format_knowledge_augmentation([]) == ""


def test_format_knowledge_augmentation_includes_snippet_numbers_and_docs() -> None:
    block = format_knowledge_augmentation(
        [{"documentName": "notes.md", "text": "some fact", "score": 0.9}]
    )
    assert "Snippet 1 (notes.md)" in block
    assert "some fact" in block


# --- resolve_embedding_model ---------------------------------------------


def test_resolve_embedding_model_prefers_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_embedding_env(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-test")
    resolution = knowledge.resolve_embedding_model()
    assert resolution is not None
    assert resolution.provider == "openai"
    assert resolution.model_id == "text-embedding-3-small"


def test_resolve_embedding_model_falls_back_to_google(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_embedding_env(monkeypatch)
    monkeypatch.setenv("GOOGLE_API_KEY", "google-test")
    resolution = knowledge.resolve_embedding_model()
    assert resolution is not None
    assert resolution.provider == "google"
    assert resolution.model_id == "gemini-embedding-001"


def test_resolve_embedding_model_none_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_embedding_env(monkeypatch)
    assert knowledge.resolve_embedding_model() is None


# --- augment_system_with_knowledge (unit, no upload pipeline) -----------


async def test_augment_system_with_knowledge_noop_without_entry() -> None:
    result = await augment_system_with_knowledge("base prompt", "no-such-graph", "a query")
    assert result == "base prompt"


async def test_augment_system_with_knowledge_appends_matching_snippet(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entry = KnowledgeEntry(
        id="graph_kb_1",
        embedding_provider="openai",
        embedding_model_id="text-embedding-3-small",
        documents=[
            KnowledgeDocument(
                id="doc1", name="facts.txt", mime_type="text/plain", uploaded_at="now", char_count=5
            )
        ],
        chunks=[
            KnowledgeChunk(id="c1", document_id="doc1", text="the sky is blue", vector=[1.0, 0.0])
        ],
    )
    storage.save_resource("knowledge", "graph_kb_1", entry.model_dump())

    monkeypatch.setattr(
        "app.knowledge.resolve_embedding_model",
        lambda: ResolvedEmbeddingModel(
            provider="openai", model_id="text-embedding-3-small", api_key="sk-test"
        ),
    )

    async def _fake_embed_query(resolution, query):
        return [1.0, 0.0]  # identical to the stored chunk's vector -> score 1.0

    monkeypatch.setattr("app.knowledge.embed_query", _fake_embed_query)

    result = await augment_system_with_knowledge("base prompt", "graph_kb_1", "what color?")
    assert "base prompt" in result
    assert "the sky is blue" in result
    assert "facts.txt" in result


async def test_augment_system_with_knowledge_noop_on_provider_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entry = KnowledgeEntry(
        id="graph_kb_2",
        embedding_provider="openai",
        embedding_model_id="text-embedding-3-small",
        chunks=[KnowledgeChunk(id="c1", document_id="doc1", text="fact", vector=[1.0, 0.0])],
        documents=[
            KnowledgeDocument(
                id="doc1", name="facts.txt", mime_type="text/plain", uploaded_at="now", char_count=4
            )
        ],
    )
    storage.save_resource("knowledge", "graph_kb_2", entry.model_dump())
    # Currently-configured provider is google, entry was indexed with openai.
    monkeypatch.setattr(
        "app.knowledge.resolve_embedding_model",
        lambda: ResolvedEmbeddingModel(
            provider="google", model_id="gemini-embedding-001", api_key="g-test"
        ),
    )
    result = await augment_system_with_knowledge("base prompt", "graph_kb_2", "a query")
    assert result == "base prompt"


async def test_augment_system_with_knowledge_degrades_silently_on_embed_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entry = KnowledgeEntry(
        id="graph_kb_3",
        embedding_provider="openai",
        embedding_model_id="text-embedding-3-small",
        chunks=[KnowledgeChunk(id="c1", document_id="doc1", text="fact", vector=[1.0, 0.0])],
        documents=[
            KnowledgeDocument(
                id="doc1", name="facts.txt", mime_type="text/plain", uploaded_at="now", char_count=4
            )
        ],
    )
    storage.save_resource("knowledge", "graph_kb_3", entry.model_dump())
    monkeypatch.setattr(
        "app.knowledge.resolve_embedding_model",
        lambda: ResolvedEmbeddingModel(
            provider="openai", model_id="text-embedding-3-small", api_key="sk-test"
        ),
    )

    async def _boom(resolution, query):
        raise RuntimeError("network exploded")

    monkeypatch.setattr("app.knowledge.embed_query", _boom)
    result = await augment_system_with_knowledge("base prompt", "graph_kb_3", "a query")
    assert result == "base prompt"


# --- Upload/list/delete API ----------------------------------------------


def test_get_knowledge_404_for_unknown_graph() -> None:
    assert client.get("/api/graphs/no-such-graph/knowledge").status_code == 404


def test_upload_returns_503_without_embedding_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_embedding_env(monkeypatch)
    demo = build_demo_graph()
    storage.save_graph(demo)
    response = client.post(
        f"/api/graphs/{demo.id}/knowledge",
        files={"file": ("notes.txt", b"some notes", "text/plain")},
    )
    assert response.status_code == 503


def test_upload_rejects_oversized_file(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.knowledge.resolve_embedding_model",
        lambda: ResolvedEmbeddingModel(
            provider="openai", model_id="text-embedding-3-small", api_key="sk-test"
        ),
    )
    demo = build_demo_graph()
    storage.save_graph(demo)
    too_big = b"x" * (knowledge.MAX_UPLOAD_BYTES + 1)
    response = client.post(
        f"/api/graphs/{demo.id}/knowledge",
        files={"file": ("big.txt", too_big, "text/plain")},
    )
    assert response.status_code == 400


def test_upload_rejects_unsupported_file_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.knowledge.resolve_embedding_model",
        lambda: ResolvedEmbeddingModel(
            provider="openai", model_id="text-embedding-3-small", api_key="sk-test"
        ),
    )
    demo = build_demo_graph()
    storage.save_graph(demo)
    response = client.post(
        f"/api/graphs/{demo.id}/knowledge",
        files={"file": ("image.png", b"\x89PNG", "image/png")},
    )
    assert response.status_code == 400


async def _fake_embed_texts(resolution, texts, *, task="document"):
    return [[float(len(t) % 7), 1.0] for t in texts]


def test_upload_success_then_conflict_on_model_mismatch_then_delete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    demo = build_demo_graph()
    storage.save_graph(demo)
    storage.delete_resource("knowledge", demo.id)

    resolution_a = ResolvedEmbeddingModel(
        provider="openai", model_id="text-embedding-3-small", api_key="sk-test"
    )
    monkeypatch.setattr("app.knowledge.resolve_embedding_model", lambda: resolution_a)
    monkeypatch.setattr("app.knowledge.embed_texts", _fake_embed_texts)

    upload = client.post(
        f"/api/graphs/{demo.id}/knowledge",
        files={"file": ("notes.txt", b"Kubernetes orchestrates containers.", "text/plain")},
    )
    assert upload.status_code == 200, upload.text
    body = upload.json()
    assert body["ok"] is True
    assert body["addedChunkCount"] == 1
    document_id = body["documentId"]

    summary = client.get(f"/api/graphs/{demo.id}/knowledge")
    assert summary.status_code == 200
    assert summary.json()["chunkCount"] == 1
    assert summary.json()["embeddingProvider"] == "openai"

    # A second upload under a different resolved embedding model conflicts.
    resolution_b = ResolvedEmbeddingModel(
        provider="google", model_id="gemini-embedding-001", api_key="g-test"
    )
    monkeypatch.setattr("app.knowledge.resolve_embedding_model", lambda: resolution_b)
    conflict = client.post(
        f"/api/graphs/{demo.id}/knowledge",
        files={"file": ("more.txt", b"more notes", "text/plain")},
    )
    assert conflict.status_code == 409

    delete_response = client.delete(f"/api/graphs/{demo.id}/knowledge/{document_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["chunkCount"] == 0

    # The whole entry is dropped once the last document is removed.
    assert client.get(f"/api/graphs/{demo.id}/knowledge").json()["documents"] == []
    assert client.delete(f"/api/graphs/{demo.id}/knowledge/{document_id}").status_code == 404


# --- compute_llm wiring: RAG augmentation is called for every llm node ---


async def test_compute_llm_calls_augment_system_with_knowledge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, str, str, str | None, str | None]] = []

    async def _spy(
        system: str,
        graph_id: str,
        query: str,
        *,
        run_id: str | None = None,
        node_id: str | None = None,
        **_: object,
    ) -> str:
        calls.append((system, graph_id, query, run_id, node_id))
        return system

    monkeypatch.setattr("app.nodes.augment_system_with_knowledge", _spy)

    graph = GraphDefinition(
        id="graph_rag_wiring_test",
        name="RAG wiring test",
        entry_node_id="input_1",
        nodes=[
            GraphNode(
                id="input_1",
                type=NodeType.INPUT,
                position=NodePosition(x=0, y=0),
                config={"variableName": "question"},
            ),
            GraphNode(
                id="llm_1",
                type=NodeType.LLM,
                position=NodePosition(x=200, y=0),
                config={"model": "stub", "systemPrompt": "Be concise."},
            ),
            GraphNode(
                id="output_1", type=NodeType.OUTPUT, position=NodePosition(x=400, y=0), config={}
            ),
        ],
        edges=[
            {"id": "e1", "source": "input_1", "target": "llm_1", "kind": "sequence"},
            {"id": "e2", "source": "llm_1", "target": "output_1", "kind": "sequence"},
        ],
    )
    compiled = compile_graph(graph, "cwf_rag_wiring_test")
    assert compiled.ok, compiled.diagnostics
    COMPILED_WORKFLOWS["cwf_rag_wiring_test"] = graph

    await start_run_inline("cwf_rag_wiring_test", {"question": "hello?"}, provider="stub")

    assert len(calls) == 1
    system, graph_id, query, run_id, node_id = calls[0]
    assert system == "Be concise."
    assert graph_id == "graph_rag_wiring_test"
    assert query == "hello?"
    # P2, "Retrieval/document lineage graph" — compute_llm threads the
    # run/node ids through so a real retrieval hit gets recorded.
    assert run_id is not None
    assert node_id == "llm_1"


# --- P2, "Retrieval/document lineage graph" ------------------------------
#
# Unlike the rest of this file (which reuses live storage and gets away with
# it because every resource lookup here overwrites by a fixed key), lineage
# entries accumulate under a fresh, unique id per retrieval — so an
# exact-count assertion needs a clean database, not just a unique graph_id.


@pytest.fixture
def _isolated_db(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _seed_lineage_entry(monkeypatch: pytest.MonkeyPatch, graph_id: str) -> KnowledgeEntry:
    entry = KnowledgeEntry(
        id=graph_id,
        embedding_provider="openai",
        embedding_model_id="text-embedding-3-small",
        documents=[
            KnowledgeDocument(
                id="doc1", name="facts.txt", mime_type="text/plain", uploaded_at="now", char_count=5
            )
        ],
        chunks=[
            KnowledgeChunk(id="c1", document_id="doc1", text="the sky is blue", vector=[1.0, 0.0])
        ],
    )
    storage.save_resource("knowledge", graph_id, entry.model_dump())
    monkeypatch.setattr(
        "app.knowledge.resolve_embedding_model",
        lambda: ResolvedEmbeddingModel(
            provider="openai", model_id="text-embedding-3-small", api_key="sk-test"
        ),
    )

    async def _fake_embed_query(resolution, query):
        return [1.0, 0.0]

    monkeypatch.setattr("app.knowledge.embed_query", _fake_embed_query)
    return entry


async def test_augment_system_with_knowledge_records_lineage_when_ids_given(
    monkeypatch: pytest.MonkeyPatch, _isolated_db: None
) -> None:
    graph_id = "graph_lineage_1"
    _seed_lineage_entry(monkeypatch, graph_id)

    await augment_system_with_knowledge(
        "base prompt", graph_id, "what color?", run_id="run_1", node_id="llm_1"
    )

    entries = list_knowledge_lineage(graph_id)
    assert len(entries) == 1
    assert entries[0].graph_id == graph_id
    assert entries[0].document_id == "doc1"
    assert entries[0].document_name == "facts.txt"
    assert entries[0].chunk_id == "c1"
    assert entries[0].run_id == "run_1"
    assert entries[0].node_id == "llm_1"
    assert entries[0].score == pytest.approx(1.0)


async def test_augment_system_with_knowledge_does_not_record_lineage_without_ids(
    monkeypatch: pytest.MonkeyPatch, _isolated_db: None
) -> None:
    graph_id = "graph_lineage_2"
    _seed_lineage_entry(monkeypatch, graph_id)

    await augment_system_with_knowledge("base prompt", graph_id, "what color?")

    assert list_knowledge_lineage(graph_id) == []


async def test_list_knowledge_lineage_filters_by_document_id(
    monkeypatch: pytest.MonkeyPatch, _isolated_db: None
) -> None:
    graph_id = "graph_lineage_3"
    entry = _seed_lineage_entry(monkeypatch, graph_id)
    entry.documents.append(
        KnowledgeDocument(
            id="doc2", name="other.txt", mime_type="text/plain", uploaded_at="now", char_count=5
        )
    )
    entry.chunks.append(
        KnowledgeChunk(id="c2", document_id="doc2", text="the grass is green", vector=[1.0, 0.0])
    )
    storage.save_resource("knowledge", graph_id, entry.model_dump())

    await augment_system_with_knowledge(
        "base prompt", graph_id, "what color?", run_id="run_1", node_id="llm_1"
    )

    all_entries = list_knowledge_lineage(graph_id)
    assert {e.document_id for e in all_entries} == {"doc1", "doc2"}

    doc1_entries = list_knowledge_lineage(graph_id, document_id="doc1")
    assert [e.document_id for e in doc1_entries] == ["doc1"]


def test_knowledge_lineage_endpoint_round_trip(
    monkeypatch: pytest.MonkeyPatch, _isolated_db: None
) -> None:
    demo = build_demo_graph()
    graph_id = f"{demo.id}_lineage_route"
    demo = demo.model_copy(update={"id": graph_id})
    storage.save_graph(demo)
    _seed_lineage_entry(monkeypatch, graph_id)

    import asyncio

    asyncio.run(
        augment_system_with_knowledge(
            "base prompt", graph_id, "what color?", run_id="run_1", node_id="llm_1"
        )
    )

    response = client.get(f"/api/graphs/{graph_id}/knowledge/lineage")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["document_id"] == "doc1"

    filtered = client.get(f"/api/graphs/{graph_id}/knowledge/lineage?document_id=doc1")
    assert len(filtered.json()) == 1

    empty = client.get(f"/api/graphs/{graph_id}/knowledge/lineage?document_id=no-such-doc")
    assert empty.json() == []


def test_knowledge_lineage_endpoint_404_for_unknown_graph() -> None:
    response = client.get("/api/graphs/does-not-exist/knowledge/lineage")
    assert response.status_code == 404
