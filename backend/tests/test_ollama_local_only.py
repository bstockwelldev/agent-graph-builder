"""Ollama is only offered in local development (VERCEL unset).

On Vercel ``localhost`` is the serverless function itself, so Ollama can never
be reached; the backend must not select it, list models for it, claim it is
ready, or start a run with it.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app
from app.model_catalog import clear_catalog_cache, list_provider_models
from app.providers.availability import OLLAMA_UNAVAILABLE_MESSAGE, is_ollama_available
from app.providers.base import (
    ChatProvider,
    ProviderUnavailable,
    get_chat_model,
    require_live_provider_allowed,
    resolve_chat_provider,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ("VERCEL", "CHAT_PROVIDER", "AI_PROVIDER", "PUBLIC_DEMO_MODE"):
        monkeypatch.delenv(key, raising=False)
    clear_catalog_cache()


@pytest.fixture
def on_vercel(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    # Vercel refuses API calls without a durable store; this suite is about providers, not storage.
    monkeypatch.setattr(storage, "storage_is_healthy", lambda: True)


def test_available_locally_and_not_on_vercel(monkeypatch: pytest.MonkeyPatch) -> None:
    assert is_ollama_available() is True
    monkeypatch.setenv("VERCEL", "1")
    assert is_ollama_available() is False


def test_local_dev_keeps_ollama_as_the_default_and_the_env_choice(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert resolve_chat_provider() == ChatProvider.OLLAMA
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    assert resolve_chat_provider() == ChatProvider.OLLAMA
    assert get_chat_model().provider_name == "ollama"


def test_default_falls_back_to_stub_on_vercel(on_vercel: None) -> None:
    assert resolve_chat_provider() == ChatProvider.STUB


@pytest.mark.parametrize("env_name", ["AI_PROVIDER", "CHAT_PROVIDER"])
def test_env_selected_ollama_is_ignored_on_vercel(
    on_vercel: None, monkeypatch: pytest.MonkeyPatch, env_name: str
) -> None:
    monkeypatch.setenv(env_name, "ollama")
    assert resolve_chat_provider() == ChatProvider.STUB
    # ...and a later, usable env choice is still honoured.
    monkeypatch.setenv("CHAT_PROVIDER", "ollama")
    monkeypatch.setenv("AI_PROVIDER", "groq")
    assert resolve_chat_provider() == ChatProvider.GROQ


def test_other_providers_are_unaffected_on_vercel(on_vercel: None) -> None:
    assert resolve_chat_provider("groq") == ChatProvider.GROQ
    assert get_chat_model(provider="stub").provider_name == "stub"


def test_explicit_ollama_is_refused_on_vercel(on_vercel: None) -> None:
    with pytest.raises(ProviderUnavailable, match="only available in local development"):
        require_live_provider_allowed("ollama", None)
    with pytest.raises(ProviderUnavailable):
        get_chat_model(provider="ollama")


def test_unknown_provider_id_is_left_to_the_callers_validation(on_vercel: None) -> None:
    require_live_provider_allowed("not-a-provider", None)  # must not raise ProviderUnavailable


def test_ready_endpoint_locally() -> None:
    assert client.get("/api/providers/ollama/ready").json() == {"ready": True, "message": ""}


def test_ready_endpoint_on_vercel(on_vercel: None) -> None:
    assert client.get("/api/providers/ollama/ready").json() == {
        "ready": False,
        "message": OLLAMA_UNAVAILABLE_MESSAGE,
    }


def test_ready_message_for_ollama_is_not_the_api_key_message_in_public_demo(
    on_vercel: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PUBLIC_DEMO_MODE", "1")
    body = client.get("/api/providers/ollama/ready").json()
    assert body["ready"] is False
    assert body["message"] == OLLAMA_UNAVAILABLE_MESSAGE


def test_model_catalog_is_empty_and_marked_unavailable_on_vercel(on_vercel: None) -> None:
    entry = asyncio.run(list_provider_models("ollama"))
    assert entry["models"] == []
    assert entry["source"] == "unavailable"
    assert entry["message"] == OLLAMA_UNAVAILABLE_MESSAGE


def test_starting_a_run_with_ollama_returns_409_on_vercel(on_vercel: None) -> None:
    response = client.post("/api/runs", json={"graph_id": "nope", "provider": "ollama"})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "provider_unavailable"


def test_starting_a_run_locally_gets_past_the_provider_check() -> None:
    response = client.post("/api/runs", json={"graph_id": "nope", "provider": "ollama"})
    assert response.status_code == 404  # unknown graph, not a provider error
