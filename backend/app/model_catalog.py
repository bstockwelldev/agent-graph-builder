"""Fetch, cache, rank, and serve chat-capable model catalogs per provider."""

from __future__ import annotations

import time
from typing import Any

import httpx

from . import storage
from .env_config import (
    resolve_azure_api_key,
    resolve_azure_api_version,
    resolve_azure_deployment_name,
    resolve_azure_endpoint,
    resolve_groq_api_key,
)
from .models import NodeType
from .provider_defaults import default_model_for_provider, resolve_model_for_provider
from .providers.groq import GROQ_BASE_URL
from .providers.ollama import OLLAMA_BASE_URL

CATALOG_TTL_SECONDS = 60
CATALOG_PROVIDERS = frozenset({"ollama", "groq", "azure"})
REQUEST_TIMEOUT_SECONDS = 30.0

_cache: dict[str, tuple[float, list[str], str, str]] = {}


def _catalog_entry(provider: str, model_ids: list[str], *, source: str, message: str) -> dict[str, Any]:
    return {
        "provider": provider,
        "models": [{"id": model_id, "label": model_id} for model_id in model_ids],
        "source": source,
        "cached": False,
        "message": message,
    }


def _is_ollama_embed_model(model_id: str) -> bool:
    lowered = model_id.lower()
    embed_markers = ("nomic-embed", "mxbai-embed", "bge-", "embed")
    return any(marker in lowered for marker in embed_markers)


def _is_groq_non_chat_model(model_id: str) -> bool:
    lowered = model_id.lower()
    blocked = ("whisper", "distil-whisper", "tts", "guard")
    return any(marker in lowered for marker in blocked)


def _is_azure_chat_model(record: dict[str, Any]) -> bool:
    capabilities = record.get("capabilities") or {}
    if capabilities.get("chat_completion") or capabilities.get("completion"):
        return True
    model_id = str(record.get("id") or record.get("model") or "").lower()
    if not model_id:
        return False
    blocked = ("embed", "whisper", "tts", "dall-e", "audio", "speech")
    return not any(marker in model_id for marker in blocked)


async def _fetch_ollama_model_ids() -> tuple[list[str], str]:
    async with httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get("/api/tags")
        response.raise_for_status()
        data = response.json()

    models = [
        str(item.get("name"))
        for item in data.get("models") or []
        if item.get("name") and not _is_ollama_embed_model(str(item.get("name")))
    ]
    return models, ""


async def _fetch_groq_model_ids() -> tuple[list[str], str]:
    api_key = resolve_groq_api_key()
    if not api_key:
        return [], "Missing GROQ_API_KEY."

    async with httpx.AsyncClient(base_url=GROQ_BASE_URL, timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get("/models", headers={"Authorization": f"Bearer {api_key}"})
        response.raise_for_status()
        data = response.json()

    models = [
        str(item.get("id"))
        for item in data.get("data") or []
        if item.get("id") and not _is_groq_non_chat_model(str(item.get("id")))
    ]
    return models, ""


async def _fetch_azure_model_ids() -> tuple[list[str], str]:
    api_key = resolve_azure_api_key()
    endpoint = resolve_azure_endpoint()
    if not api_key or not endpoint:
        return [], "Missing Azure OpenAI credentials."

    async with httpx.AsyncClient(base_url=endpoint.rstrip("/"), timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(
            "/openai/models",
            params={"api-version": resolve_azure_api_version()},
            headers={"api-key": api_key},
        )
        if response.status_code == 404:
            deployment = resolve_azure_deployment_name()
            if deployment:
                return [deployment], ""
            return [], "Azure models endpoint returned 404 and no deployment is configured."

        response.raise_for_status()
        data = response.json()

    models = [
        str(item.get("id"))
        for item in data.get("data") or []
        if item.get("id") and _is_azure_chat_model(item)
    ]
    if not models:
        deployment = resolve_azure_deployment_name()
        if deployment:
            return [deployment], ""
    return models, ""


async def _fetch_live_model_ids(provider: str) -> tuple[list[str], str, str]:
    if provider == "ollama":
        models, message = await _fetch_ollama_model_ids()
        return models, "live", message
    if provider == "groq":
        models, message = await _fetch_groq_model_ids()
        return models, "live", message
    if provider == "azure":
        models, message = await _fetch_azure_model_ids()
        return models, "live", message
    raise ValueError(f"Unsupported catalog provider: {provider}")


async def _get_cached_live_model_ids(provider: str) -> tuple[list[str], str, str, bool]:
    now = time.monotonic()
    cached = _cache.get(provider)
    if cached is not None:
        expires_at, model_ids, source, message = cached
        if now < expires_at:
            return model_ids, source, message, True

    try:
        model_ids, source, message = await _fetch_live_model_ids(provider)
        if not model_ids:
            fallback = default_model_for_provider(provider)
            return [fallback], "fallback", message or f"Using provider default model {fallback}.", False
        _cache[provider] = (now + CATALOG_TTL_SECONDS, model_ids, source, message)
        return model_ids, source, message, False
    except Exception as exc:  # noqa: BLE001 - catalog must not 500 on provider errors
        fallback = default_model_for_provider(provider)
        return [fallback], "fallback", str(exc), False


def _graph_llm_models(graph_id: str | None, provider: str) -> list[str]:
    if not graph_id:
        return []
    graph = storage.get_graph(graph_id)
    if graph is None:
        return []

    resolved: list[str] = []
    seen: set[str] = set()
    for node in graph.nodes:
        if node.type != NodeType.LLM:
            continue
        raw_model = node.config.get("model")
        model = resolve_model_for_provider(provider, str(raw_model) if raw_model else None)
        if model not in seen:
            seen.add(model)
            resolved.append(model)
    return resolved


def _rank_models(provider: str, live_models: list[str], graph_id: str | None) -> list[str]:
    live_set = set(live_models)
    ranked: list[str] = []
    seen: set[str] = set()

    for model in _graph_llm_models(graph_id, provider):
        if model in live_set and model not in seen:
            ranked.append(model)
            seen.add(model)

    default_model = default_model_for_provider(provider)
    if default_model in live_set and default_model not in seen:
        ranked.append(default_model)
        seen.add(default_model)

    for model in live_models:
        if model not in seen:
            ranked.append(model)
            seen.add(model)

    return ranked[:5]


async def list_provider_models(provider: str, graph_id: str | None = None) -> dict[str, Any]:
    if provider not in CATALOG_PROVIDERS:
        fallback = default_model_for_provider(provider)
        return _catalog_entry(provider, [fallback], source="fallback", message="Static fallback for this provider.")

    live_models, source, message, cached = await _get_cached_live_model_ids(provider)
    ranked = _rank_models(provider, live_models, graph_id)
    response = _catalog_entry(provider, ranked, source=source, message=message)
    response["cached"] = cached
    return response


def clear_catalog_cache() -> None:
    _cache.clear()
