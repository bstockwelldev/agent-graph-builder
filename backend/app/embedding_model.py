"""Embedding provider resolution for graph knowledge bases (RAG,
studio-consolidation Phase 5 — see
docs/planning/features/studio-consolidation-plan.md). Ported from
micro-ui-agent-builder's `lib/server/embedding-model.ts`, plus a Supabase
provider. Plain `httpx` calls rather than the Vercel AI SDK's
`embed`/`embedMany` — AGB has no equivalent SDK dependency, and the
embeddings APIs are simple enough not to need one.

Default order: Supabase (`gte-small`, run by the `agb-embed` Edge Function
in `supabase/functions/` — no third-party key, just the service-role key
production already has for storage), then OpenAI (`text-embedding-3-small`),
then Google (`gemini-embedding-001`). `EMBEDDING_PROVIDER` forces one.
The default only picks the provider for a graph's *first* upload: after
that the graph stays on the provider it was indexed with (see
`resolve_embedding_model_for` and knowledge.py), since vectors from
different models aren't comparable.
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import Literal, get_args

import httpx

from .env_config import public_demo_mode_enabled

EmbeddingProvider = Literal["supabase", "openai", "google"]
EmbeddingTask = Literal["document", "query"]

SUPABASE_DEFAULT_EMBEDDING_MODEL = "gte-small"
OPENAI_DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
GOOGLE_DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"

SUPABASE_EMBED_FUNCTION = "agb-embed"
# Mirrors MAX_INPUTS in supabase/functions/agb-embed/index.ts: the Edge
# Function's per-request CPU budget fits 8 ~900-char chunks reliably, so
# larger batches are split and sent a few requests at a time instead.
SUPABASE_EMBED_BATCH = 8
SUPABASE_EMBED_CONCURRENCY = 6

_DEFAULT_ORDER: tuple[EmbeddingProvider, ...] = ("supabase", "openai", "google")

_GOOGLE_EMBEDDING_KEY_NAMES = (
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_GENAI_API_KEY",
    "GOOGLE_API_KEY",
)


@dataclass
class ResolvedEmbeddingModel:
    provider: EmbeddingProvider
    model_id: str
    api_key: str
    # Supabase only: the Edge Function URL.
    endpoint: str = ""


def _first_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def supabase_embed_url() -> str:
    """`SUPABASE_EMBEDDINGS_URL` overrides the function URL — useful locally,
    where setting `SUPABASE_URL` would also switch graph storage to the
    production bucket (storage.py)."""
    override = os.environ.get("SUPABASE_EMBEDDINGS_URL", "").strip()
    if override:
        return override
    base = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    return f"{base}/functions/v1/{SUPABASE_EMBED_FUNCTION}" if base else ""


def resolve_embedding_model_for(provider: EmbeddingProvider) -> ResolvedEmbeddingModel | None:
    """`provider`'s resolution when its credentials are configured, else None."""
    # Embeddings run on the server's key only; PUBLIC_DEMO_MODE turns them
    # off (uploads 403, retrieval is skipped like any unconfigured provider).
    if public_demo_mode_enabled():
        return None
    if provider == "supabase":
        url = supabase_embed_url()
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not (url and key):
            return None
        return ResolvedEmbeddingModel(
            provider="supabase",
            model_id=SUPABASE_DEFAULT_EMBEDDING_MODEL,
            api_key=key,
            endpoint=url,
        )
    if provider == "openai":
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            return None
        model_id = os.environ.get("OPENAI_EMBEDDING_MODEL", "").strip() or (
            OPENAI_DEFAULT_EMBEDDING_MODEL
        )
        return ResolvedEmbeddingModel(provider="openai", model_id=model_id, api_key=key)
    key = _first_env(*_GOOGLE_EMBEDDING_KEY_NAMES)
    if not key:
        return None
    model_id = os.environ.get("GOOGLE_EMBEDDING_MODEL", "").strip() or (
        GOOGLE_DEFAULT_EMBEDDING_MODEL
    )
    return ResolvedEmbeddingModel(provider="google", model_id=model_id, api_key=key)


def resolve_embedding_model() -> ResolvedEmbeddingModel | None:
    """The provider a graph's first knowledge upload would use right now."""
    forced = os.environ.get("EMBEDDING_PROVIDER", "").strip().lower()
    if forced in get_args(EmbeddingProvider):
        return resolve_embedding_model_for(forced)  # type: ignore[arg-type]
    for provider in _DEFAULT_ORDER:
        resolution = resolve_embedding_model_for(provider)
        if resolution is not None:
            return resolution
    return None


def missing_embedding_provider_message() -> str:
    return (
        "No embedding provider configured for graph knowledge uploads. Set SUPABASE_URL + "
        "SUPABASE_SERVICE_ROLE_KEY (gte-small via the agb-embed Edge Function; no extra key), "
        "OPENAI_API_KEY (text-embedding-3-small), or a Gemini key (GOOGLE_GENERATIVE_AI_API_KEY / "
        "GEMINI_API_KEY / GOOGLE_GENAI_API_KEY / GOOGLE_API_KEY)."
    )


class EmbeddingProviderError(RuntimeError):
    """Raised when the embedding provider's API call fails or returns an
    unexpected shape."""


async def _embed_supabase_batch(
    client: httpx.AsyncClient, resolution: ResolvedEmbeddingModel, texts: list[str]
) -> list[list[float]]:
    headers = {"Authorization": f"Bearer {resolution.api_key}"}
    for attempt in range(2):
        response = await client.post(resolution.endpoint, headers=headers, json={"input": texts})
        # 546 = the function hit its CPU limit; 503 = cold-start/boot error.
        # Both are transient at this batch size, so retry once.
        if response.status_code not in (503, 546) or attempt == 1:
            break
    if response.status_code != 200:
        raise EmbeddingProviderError(f"Supabase embeddings request failed ({response.status_code})")
    embeddings = response.json().get("embeddings", [])
    if len(embeddings) != len(texts):
        raise EmbeddingProviderError("Supabase embeddings response had an unexpected item count")
    return embeddings


async def _embed_supabase(
    resolution: ResolvedEmbeddingModel, texts: list[str]
) -> list[list[float]]:
    batches = [
        texts[i : i + SUPABASE_EMBED_BATCH] for i in range(0, len(texts), SUPABASE_EMBED_BATCH)
    ]
    limit = asyncio.Semaphore(SUPABASE_EMBED_CONCURRENCY)
    async with httpx.AsyncClient(timeout=60.0) as client:

        async def run(batch: list[str]) -> list[list[float]]:
            async with limit:
                return await _embed_supabase_batch(client, resolution, batch)

        results = await asyncio.gather(*(run(batch) for batch in batches))
    return [vector for batch in results for vector in batch]


async def _embed_openai(resolution: ResolvedEmbeddingModel, texts: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {resolution.api_key}"},
            json={"model": resolution.model_id, "input": texts},
        )
    if response.status_code != 200:
        raise EmbeddingProviderError(f"OpenAI embeddings request failed ({response.status_code})")
    data = response.json().get("data", [])
    if len(data) != len(texts):
        raise EmbeddingProviderError("OpenAI embeddings response had an unexpected item count")
    ordered = sorted(data, key=lambda item: item.get("index", 0))
    return [item["embedding"] for item in ordered]


async def _embed_google(
    resolution: ResolvedEmbeddingModel, texts: list[str], task: EmbeddingTask
) -> list[list[float]]:
    task_type = "RETRIEVAL_DOCUMENT" if task == "document" else "RETRIEVAL_QUERY"
    model_path = f"models/{resolution.model_id}"
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/{model_path}:batchEmbedContents"
        f"?key={resolution.api_key}"
    )
    requests = [
        {
            "model": model_path,
            "content": {"parts": [{"text": text}]},
            "taskType": task_type,
        }
        for text in texts
    ]
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json={"requests": requests})
    if response.status_code != 200:
        raise EmbeddingProviderError(f"Google embeddings request failed ({response.status_code})")
    embeddings = response.json().get("embeddings", [])
    if len(embeddings) != len(texts):
        raise EmbeddingProviderError("Google embeddings response had an unexpected item count")
    return [item["values"] for item in embeddings]


async def embed_texts(
    resolution: ResolvedEmbeddingModel, texts: list[str], *, task: EmbeddingTask = "document"
) -> list[list[float]]:
    if not texts:
        return []
    if resolution.provider == "supabase":
        return await _embed_supabase(resolution, texts)
    if resolution.provider == "openai":
        return await _embed_openai(resolution, texts)
    return await _embed_google(resolution, texts, task)


async def embed_query(resolution: ResolvedEmbeddingModel, query: str) -> list[float]:
    vectors = await embed_texts(resolution, [query], task="query")
    return vectors[0]
