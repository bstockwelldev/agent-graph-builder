"""Embedding provider resolution for graph knowledge bases (RAG,
studio-consolidation Phase 5 — see
docs/planning/features/studio-consolidation-plan.md). Ported from
micro-ui-agent-builder's `lib/server/embedding-model.ts`: OpenAI first
(`text-embedding-3-small`), else Google (`gemini-embedding-001`). Plain
`httpx` calls rather than the Vercel AI SDK's `embed`/`embedMany` — AGB has
no equivalent SDK dependency, and the embeddings APIs are simple enough not
to need one.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

import httpx

from .env_config import public_demo_mode_enabled

EmbeddingProvider = Literal["openai", "google"]
EmbeddingTask = Literal["document", "query"]

OPENAI_DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
GOOGLE_DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"

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


def _first_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def resolve_embedding_model() -> ResolvedEmbeddingModel | None:
    # Embeddings run on the server's key only; PUBLIC_DEMO_MODE turns them
    # off (uploads 403, retrieval is skipped like any unconfigured provider).
    if public_demo_mode_enabled():
        return None
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if openai_key:
        model_id = os.environ.get("OPENAI_EMBEDDING_MODEL", "").strip() or (
            OPENAI_DEFAULT_EMBEDDING_MODEL
        )
        return ResolvedEmbeddingModel(provider="openai", model_id=model_id, api_key=openai_key)

    google_key = _first_env(*_GOOGLE_EMBEDDING_KEY_NAMES)
    if google_key:
        model_id = os.environ.get("GOOGLE_EMBEDDING_MODEL", "").strip() or (
            GOOGLE_DEFAULT_EMBEDDING_MODEL
        )
        return ResolvedEmbeddingModel(provider="google", model_id=model_id, api_key=google_key)

    return None


def missing_embedding_provider_message() -> str:
    return (
        "No embedding provider configured for graph knowledge uploads. Set OPENAI_API_KEY "
        "(preferred, text-embedding-3-small) or a Gemini key (GOOGLE_GENERATIVE_AI_API_KEY / "
        "GEMINI_API_KEY / GOOGLE_GENAI_API_KEY / GOOGLE_API_KEY)."
    )


class EmbeddingProviderError(RuntimeError):
    """Raised when the embedding provider's API call fails or returns an
    unexpected shape."""


async def _embed_openai(
    resolution: ResolvedEmbeddingModel, texts: list[str]
) -> list[list[float]]:
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
    if resolution.provider == "openai":
        return await _embed_openai(resolution, texts)
    return await _embed_google(resolution, texts, task)


async def embed_query(resolution: ResolvedEmbeddingModel, query: str) -> list[float]:
    vectors = await embed_texts(resolution, [query], task="query")
    return vectors[0]
