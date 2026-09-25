"""Per-graph knowledge base / RAG (studio-consolidation Phase 5 — see
docs/planning/features/studio-consolidation-plan.md). Ported from
micro-ui-agent-builder's `lib/server/flow-knowledge-rag.ts` +
`flow-knowledge-store.ts`, combined into one module and keyed by AGB's
`graph_id` (MUI's "flow") rather than a flat local JSON file: entries are
stored via `storage.save_resource("knowledge", graph_id, ...)`, which
already dispatches to `supabase_store.py`/`object_store.py`/SQLite/Turso —
replacing MUI's raw-floats-in-a-JSON-file store with AGB's existing durable
backend, not a new one.

Scoped as a **graph-level flag** (a knowledge entry either exists for a
graph or it doesn't), not a 13th `NodeType` — the plan offered both as
acceptable; a node type would mean re-touching the whole studio graph
editor (palette/inspector/SDK schema) for what is otherwise a pure backend
capability. `compute_llm` (nodes.py) augments its system prompt
automatically when the graph it's running in has an uploaded knowledge
base — no per-node opt-in.
"""

from __future__ import annotations

import math
import re
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

import httpx
from pydantic import BaseModel

from . import storage
from .embedding_model import (
    EmbeddingProviderError,
    ResolvedEmbeddingModel,
    embed_query,
    embed_texts,
    missing_embedding_provider_message,
    resolve_embedding_model,
)
from .events import now_iso
from .models import KnowledgeLineageEntry

CHUNK_TARGET = 900
CHUNK_OVERLAP = 100
TOP_K = 5
SCORE_THRESHOLD = 0.15
MAX_UPLOAD_BYTES = 400 * 1024
EMBED_BATCH = 64

_RESOURCE_KIND = "knowledge"


class KnowledgeDocument(BaseModel):
    id: str
    name: str
    mime_type: str
    uploaded_at: str
    char_count: int


class KnowledgeChunk(BaseModel):
    id: str
    document_id: str
    text: str
    vector: list[float]


class KnowledgeEntry(BaseModel):
    id: str  # graph_id — the resource key, matching every other stored resource kind
    embedding_provider: Literal["openai", "google"]
    embedding_model_id: str
    documents: list[KnowledgeDocument] = []
    chunks: list[KnowledgeChunk] = []


def chunk_text(text: str, max_len: int = CHUNK_TARGET, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Splits text into overlapping chunks, preferring paragraph/word
    boundaries near `max_len`. Direct port of `flow-knowledge-rag.ts`'s
    `chunkText`.
    """
    normalized = re.sub(r"\r\n", "\n", text).strip()
    if not normalized:
        return []
    chunks: list[str] = []
    start = 0
    length = len(normalized)
    while start < length:
        end = min(start + max_len, length)
        if end < length:
            slice_ = normalized[start:end]
            last_para = slice_.rfind("\n\n")
            last_space = slice_.rfind(" ")
            if last_para > max_len * 0.45:
                break_at = last_para + 2
            elif last_space > max_len * 0.45:
                break_at = last_space + 1
            else:
                break_at = end - start
            end = min(start + break_at, length)
        piece = normalized[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= length:
            # Reached the end of the text: stop, rather than let the
            # overlap window keep re-slicing the same tail (a latent bug in
            # the MUI source this was ported from — any text no longer than
            # `overlap` would otherwise degrade into dozens of
            # near-duplicate one-character-shifted chunks).
            break
        next_start = end - overlap
        start = start + 1 if next_start <= start else next_start
    return chunks


def cosine_similarity(a: list[float], b: list[float]) -> float:
    length = min(len(a), len(b))
    dot = sum(a[i] * b[i] for i in range(length))
    norm_a = math.sqrt(sum(a[i] * a[i] for i in range(length)))
    norm_b = math.sqrt(sum(b[i] * b[i] for i in range(length)))
    denom = norm_a * norm_b
    return 0.0 if denom < 1e-12 else dot / denom


def top_k_chunks_by_embedding(
    query_vector: list[float], chunks: list[KnowledgeChunk], document_names: dict[str, str], k: int
) -> list[dict[str, Any]]:
    scored = [
        {
            "chunkId": chunk.id,
            "documentId": chunk.document_id,
            "documentName": document_names.get(chunk.document_id, chunk.document_id),
            "text": chunk.text,
            "score": cosine_similarity(query_vector, chunk.vector),
        }
        for chunk in chunks
    ]
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:k]


def format_knowledge_augmentation(hits: list[dict[str, Any]]) -> str:
    if not hits:
        return ""
    lines = [
        f"### Snippet {i + 1} ({hit['documentName']})\n{hit['text']}" for i, hit in enumerate(hits)
    ]
    return "\n".join(
        [
            "",
            "[Graph knowledge base — retrieved snippets; prefer facts from here when relevant; "
            "cite by snippet number if useful]",
            *lines,
        ]
    )


def get_knowledge_entry(graph_id: str) -> KnowledgeEntry | None:
    payload = storage.get_resource(_RESOURCE_KIND, graph_id)
    if payload is None:
        return None
    return KnowledgeEntry.model_validate(payload)


def list_knowledge_lineage(
    graph_id: str, document_id: str | None = None
) -> list[KnowledgeLineageEntry]:
    """P2, "Retrieval/document lineage graph": every recorded retrieval for
    `graph_id`, newest last, optionally filtered to one document."""
    return [
        KnowledgeLineageEntry.model_validate(item)
        for item in storage.list_knowledge_lineage(graph_id, document_id)
    ]


# P0 graph foundation, Slice C: sentinel distinguishing "no resource_snapshot
# argument given" (draft-sourced run — resolve live, the pre-Slice-C
# behavior) from an explicit `None` (release-sourced run whose release has
# no knowledge base — resolve nothing, never fall back to live storage). See
# `augment_system_with_knowledge` and nodes.py's `_resolve_resource`.
UNSET = object()


def _embedding_model_for_entry(entry: KnowledgeEntry) -> ResolvedEmbeddingModel | None:
    current = resolve_embedding_model()
    if current is None:
        return None
    if current.provider != entry.embedding_provider or current.model_id != entry.embedding_model_id:
        return None
    return current


def _record_lineage(graph_id: str, run_id: str, node_id: str, hits: list[dict[str, Any]]) -> None:
    """P2, "Retrieval/document lineage graph": one durable row per chunk
    actually used to augment this node's prompt, so "which runs used
    document X" stays queryable without scanning every run's NodeTraces.
    Best-effort like the retrieval it records — a storage error here must
    not fail the run any more than an embedding error above does."""
    now = now_iso()
    try:
        for hit in hits:
            entry = KnowledgeLineageEntry(
                id=f"klin_{uuid4().hex[:12]}",
                graph_id=graph_id,
                document_id=hit["documentId"],
                document_name=hit["documentName"],
                chunk_id=hit["chunkId"],
                run_id=run_id,
                node_id=node_id,
                score=hit["score"],
                created_at=now,
            )
            storage.save_knowledge_lineage_entry(graph_id, entry.id, entry.model_dump(mode="json"))
    except Exception:  # noqa: BLE001 - lineage recording is best-effort
        pass


async def augment_system_with_knowledge(
    system: str,
    graph_id: str,
    query: str,
    *,
    resource_snapshot: Any = UNSET,
    run_id: str | None = None,
    node_id: str | None = None,
) -> str:
    """When `graph_id` has an uploaded knowledge base, embeds `query` and
    appends top-K snippets above the score threshold to `system`. Degrades
    silently to the unmodified prompt on any failure (missing/mismatched
    embedding provider, embedding API error) — RAG is an enhancement, not a
    load-bearing part of the run; a run should not fail because a knowledge
    lookup did.

    `resource_snapshot` (P0 graph foundation, Slice C): omitted (the
    default `UNSET`) resolves the entry live from storage, unchanged from
    before this parameter existed. Passed explicitly — even as `None` — it
    is used as-is instead: a release-sourced run's already-resolved
    snapshot (or `None` when that release has no knowledge base), never
    falling back to a live lookup.

    `run_id`/`node_id` (P2, "Retrieval/document lineage graph"): when both
    are given and at least one chunk is actually used, each hit is recorded
    as a `KnowledgeLineageEntry`. Optional and keyword-only so every
    existing caller that doesn't need lineage (tests, any future direct
    use) is unaffected.
    """
    entry = (
        get_knowledge_entry(graph_id)
        if resource_snapshot is UNSET
        else (
            KnowledgeEntry.model_validate(resource_snapshot)
            if resource_snapshot is not None
            else None
        )
    )
    if entry is None or not entry.chunks:
        return system
    query = query.strip()
    if not query:
        return system
    model = _embedding_model_for_entry(entry)
    if model is None:
        return system
    try:
        query_vector = await embed_query(model, query)
        names = {doc.id: doc.name for doc in entry.documents}
        hits = [
            hit
            for hit in top_k_chunks_by_embedding(query_vector, entry.chunks, names, TOP_K)
            if hit["score"] > SCORE_THRESHOLD
        ]
        if hits and run_id is not None and node_id is not None:
            _record_lineage(graph_id, run_id, node_id, hits)
        block = format_knowledge_augmentation(hits)
        return f"{system}{block}" if block else system
    except Exception:  # noqa: BLE001 - RAG is best-effort, never fails the run
        return system


class KnowledgeUploadError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


def summarize_entry(entry: KnowledgeEntry | None) -> dict[str, Any]:
    if entry is None:
        return {
            "documents": [],
            "chunkCount": 0,
            "embeddingProvider": None,
            "embeddingModelId": None,
        }
    return {
        "documents": [doc.model_dump() for doc in entry.documents],
        "chunkCount": len(entry.chunks),
        "embeddingProvider": entry.embedding_provider,
        "embeddingModelId": entry.embedding_model_id,
    }


_ALLOWED_TEXT_EXTENSIONS = (".txt", ".md", ".markdown")


def _looks_like_text_file(name: str, mime_type: str) -> bool:
    lower_name = name.lower()
    if mime_type in {"text/plain", "text/markdown", "text/x-markdown"}:
        return True
    if mime_type == "application/octet-stream" or not mime_type:
        return lower_name.endswith(_ALLOWED_TEXT_EXTENSIONS)
    return lower_name.endswith(_ALLOWED_TEXT_EXTENSIONS)


async def upload_knowledge_document(
    graph_id: str, filename: str, mime_type: str, content: bytes
) -> dict[str, Any]:
    """Chunks, embeds, and stores one uploaded document for `graph_id`.
    Raises `KnowledgeUploadError` with the same status codes MUI's route
    used (400 bad input, 409 embedding-model mismatch, 502 provider
    returned the wrong shape, 503 no embedding provider configured).
    """
    resolution = resolve_embedding_model()
    if resolution is None:
        raise KnowledgeUploadError(503, missing_embedding_provider_message())

    if len(content) > MAX_UPLOAD_BYTES:
        raise KnowledgeUploadError(400, f"File too large (max {MAX_UPLOAD_BYTES} bytes)")

    name = filename or "upload.txt"
    mime = (mime_type or "application/octet-stream").lower()
    if not _looks_like_text_file(name, mime):
        raise KnowledgeUploadError(
            400, "Unsupported file type. Upload .txt or .md (text/plain or text/markdown)."
        )

    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise KnowledgeUploadError(400, "Could not read file as UTF-8 text") from exc

    pieces = chunk_text(text)
    if not pieces:
        raise KnowledgeUploadError(400, "No text content to index")

    entry = get_knowledge_entry(graph_id)
    if entry is not None and (entry.chunks or entry.documents):
        provider_changed = entry.embedding_provider != resolution.provider
        model_changed = entry.embedding_model_id != resolution.model_id
        if provider_changed or model_changed:
            raise KnowledgeUploadError(
                409,
                "This graph's knowledge was indexed with a different embedding provider/model. "
                "Remove all documents and re-upload, or restore the same API keys and embedding "
                "model env vars.",
            )
    else:
        entry = KnowledgeEntry(
            id=graph_id,
            embedding_provider=resolution.provider,
            embedding_model_id=resolution.model_id,
        )

    doc_id = uuid4().hex
    now = datetime.now(UTC).isoformat()
    doc = KnowledgeDocument(
        id=doc_id, name=name, mime_type=mime, uploaded_at=now, char_count=len(text)
    )

    new_chunks: list[KnowledgeChunk] = []
    for i in range(0, len(pieces), EMBED_BATCH):
        batch = pieces[i : i + EMBED_BATCH]
        try:
            vectors = await embed_texts(resolution, batch)
        except EmbeddingProviderError as exc:
            # Provider-side failure (quota/auth/bad shape): surface its
            # status-only message instead of letting it escape as a bare 500.
            raise KnowledgeUploadError(502, f"Embedding provider error: {exc}") from exc
        except httpx.HTTPError as exc:
            # Deliberately generic: for Google the API key rides in the
            # request URL, and httpx error strings can include that URL.
            raise KnowledgeUploadError(
                502, "Could not reach the embedding provider. Try again shortly."
            ) from exc
        if len(vectors) != len(batch):
            raise KnowledgeUploadError(502, "Embedding provider returned unexpected batch size")
        for text_piece, vector in zip(batch, vectors, strict=True):
            new_chunks.append(
                KnowledgeChunk(id=uuid4().hex, document_id=doc_id, text=text_piece, vector=vector)
            )

    entry.documents.append(doc)
    entry.chunks.extend(new_chunks)
    storage.save_resource(_RESOURCE_KIND, graph_id, entry.model_dump())

    return {
        "ok": True,
        "documentId": doc_id,
        "addedChunkCount": len(new_chunks),
        **summarize_entry(entry),
    }


def delete_knowledge_document(graph_id: str, document_id: str) -> dict[str, Any] | None:
    """Returns None when there's nothing for this graph, or the document id
    doesn't exist within it (caller maps both to 404)."""
    entry = get_knowledge_entry(graph_id)
    if entry is None:
        return None
    before = len(entry.documents)
    entry.documents = [doc for doc in entry.documents if doc.id != document_id]
    if len(entry.documents) == before:
        return None
    entry.chunks = [chunk for chunk in entry.chunks if chunk.document_id != document_id]

    if not entry.documents:
        storage.delete_resource(_RESOURCE_KIND, graph_id)
        return {"ok": True, **summarize_entry(None)}
    storage.save_resource(_RESOURCE_KIND, graph_id, entry.model_dump())
    return {"ok": True, **summarize_entry(entry)}
