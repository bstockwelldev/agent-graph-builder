"""Azure OpenAI adapter, factory, and ready-endpoint tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.provider_defaults import resolve_model_for_provider
from app.providers.azure import AzureOpenAIChatModel
from app.providers.base import ChatProvider, get_chat_model, resolve_chat_provider

client = TestClient(app)


@pytest.mark.asyncio
async def test_azure_posts_deployment_chat_completions(httpx_mock) -> None:
    httpx_mock.add_response(
        url="https://example.openai.azure.com/openai/deployments/my-deployment/chat/completions?api-version=2024-02-15-preview",
        json={"choices": [{"message": {"content": "technical"}}]},
    )

    model = AzureOpenAIChatModel(
        model="my-deployment",
        api_key="azure-test",
        endpoint="https://example.openai.azure.com",
        api_version="2024-02-15-preview",
    )
    result = await model.generate(system_prompt="classify", user_prompt="database index")
    assert result == "technical"

    request = httpx_mock.get_requests()[0]
    assert request.headers["api-key"] == "azure-test"
    assert "Authorization" not in request.headers


def test_factory_returns_azure() -> None:
    model = get_chat_model(provider=ChatProvider.AZURE.value)
    assert model.provider_name == "azure"


def test_ai_provider_env_maps_to_azure(monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "azure")
    monkeypatch.delenv("CHAT_PROVIDER", raising=False)
    assert resolve_chat_provider(None) == ChatProvider.AZURE


def test_resolve_model_uses_azure_deployment_env(monkeypatch) -> None:
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT_NAME", "prod-gpt4o-mini")
    assert resolve_model_for_provider("azure", "qwen2.5:3b") == "prod-gpt4o-mini"


def test_azure_provider_ready_without_credentials(monkeypatch) -> None:
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_OPENAI_DEPLOYMENT_NAME", raising=False)

    response = client.get("/api/providers/azure/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is False
    assert "AZURE_OPENAI" in body["message"]


def test_azure_provider_ready_with_credentials(monkeypatch) -> None:
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT_NAME", "my-deployment")

    response = client.get("/api/providers/azure/ready")
    assert response.status_code == 200
    assert response.json()["ready"] is True
