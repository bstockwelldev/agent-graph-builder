"""Model catalog fetch, cache, ranking, and endpoint tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.demo_graph import DEMO_GRAPH_ID
from app.main import app
from app.model_catalog import clear_catalog_cache, list_provider_models

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_catalog_cache() -> None:
    clear_catalog_cache()
    yield
    clear_catalog_cache()


@pytest.mark.asyncio
async def test_groq_catalog_filters_non_chat_models(httpx_mock, monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "groq-test")
    httpx_mock.add_response(
        url="https://api.groq.com/openai/v1/models",
        json={
            "data": [
                {"id": "llama-3.3-70b-versatile"},
                {"id": "whisper-large-v3"},
                {"id": "distil-whisper-large-v3-en"},
                {"id": "playai-tts"},
                {"id": "llama-guard-3-8b"},
            ]
        },
    )

    catalog = await list_provider_models("groq")
    model_ids = [item["id"] for item in catalog["models"]]
    assert model_ids == ["llama-3.3-70b-versatile"]
    assert catalog["source"] == "live"
    assert catalog["cached"] is False


@pytest.mark.asyncio
async def test_ollama_catalog_filters_embed_models(httpx_mock) -> None:
    httpx_mock.add_response(
        url="http://localhost:11434/api/tags",
        json={
            "models": [
                {"name": "qwen2.5:3b"},
                {"name": "nomic-embed-text"},
                {"name": "mxbai-embed-large"},
                {"name": "bge-large"},
            ]
        },
    )

    catalog = await list_provider_models("ollama")
    model_ids = [item["id"] for item in catalog["models"]]
    assert model_ids == ["qwen2.5:3b"]


@pytest.mark.asyncio
async def test_azure_catalog_uses_models_endpoint(httpx_mock, monkeypatch) -> None:
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "azure-test")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o-mini")
    httpx_mock.add_response(
        url="https://example.openai.azure.com/openai/models?api-version=2024-02-15-preview",
        json={
            "data": [
                {"id": "gpt-4o-mini", "capabilities": {"chat_completion": True}},
                {"id": "text-embedding-ada-002", "capabilities": {"embeddings": True}},
            ]
        },
    )

    catalog = await list_provider_models("azure")
    model_ids = [item["id"] for item in catalog["models"]]
    assert model_ids == ["gpt-4o-mini"]


@pytest.mark.asyncio
async def test_azure_catalog_falls_back_to_deployment_on_404(httpx_mock, monkeypatch) -> None:
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "azure-test")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT_NAME", "my-deployment")
    httpx_mock.add_response(
        url="https://example.openai.azure.com/openai/models?api-version=2024-02-15-preview",
        status_code=404,
    )

    catalog = await list_provider_models("azure")
    assert [item["id"] for item in catalog["models"]] == ["my-deployment"]


@pytest.mark.asyncio
async def test_catalog_caps_at_five_models(httpx_mock, monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "groq-test")
    httpx_mock.add_response(
        url="https://api.groq.com/openai/v1/models",
        json={"data": [{"id": f"model-{index}"} for index in range(8)]},
    )

    catalog = await list_provider_models("groq")
    assert len(catalog["models"]) == 5


@pytest.mark.asyncio
async def test_catalog_ranks_graph_llm_models_first(httpx_mock, monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "groq-test")
    httpx_mock.add_response(
        url="https://api.groq.com/openai/v1/models",
        json={
            "data": [
                {"id": "alpha-model"},
                {"id": "llama-3.3-70b-versatile"},
                {"id": "beta-model"},
            ]
        },
    )

    catalog = await list_provider_models("groq", DEMO_GRAPH_ID)
    model_ids = [item["id"] for item in catalog["models"]]
    assert model_ids[0] == "llama-3.3-70b-versatile"


@pytest.mark.asyncio
async def test_catalog_uses_cache_on_second_call(httpx_mock, monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "groq-test")
    httpx_mock.add_response(
        url="https://api.groq.com/openai/v1/models",
        json={"data": [{"id": "llama-3.3-70b-versatile"}]},
    )

    first = await list_provider_models("groq")
    second = await list_provider_models("groq")

    assert first["cached"] is False
    assert second["cached"] is True
    assert len(httpx_mock.get_requests()) == 1


@pytest.mark.asyncio
async def test_catalog_fallback_without_groq_key() -> None:
    catalog = await list_provider_models("groq")
    assert catalog["source"] == "fallback"
    assert len(catalog["models"]) == 1
    assert catalog["models"][0]["id"] == "llama-3.3-70b-versatile"
    assert catalog["message"]


@pytest.mark.asyncio
async def test_stub_catalog_is_static_fallback() -> None:
    catalog = await list_provider_models("stub")
    assert catalog["source"] == "fallback"
    assert catalog["models"] == [{"id": "stub", "label": "stub"}]


def test_models_endpoint_returns_catalog(httpx_mock, monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "groq-test")
    httpx_mock.add_response(
        url="https://api.groq.com/openai/v1/models",
        json={"data": [{"id": "llama-3.3-70b-versatile"}]},
    )

    response = client.get("/api/providers/groq/models")
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "groq"
    assert body["models"][0]["id"] == "llama-3.3-70b-versatile"
