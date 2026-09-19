"""Groq, Google GenAI, and shared env loading tests."""

from __future__ import annotations

import json

import pytest

from app.env_config import (
    load_shared_env,
    parse_env_file,
    resolve_groq_api_key,
    resolve_shared_env_file,
)
from app.provider_defaults import resolve_model_for_provider
from app.providers.base import ChatProvider, get_chat_model, resolve_chat_provider
from app.providers.google import GoogleGenAIChatModel
from app.providers.groq import GroqChatModel


def test_parse_env_file_ignores_comments_and_export(tmp_path) -> None:
    path = tmp_path / ".env.local"
    path.write_text(
        "# comment\nexport GROQ_API_KEY=groq-from-file\nGOOGLE_GENAI_API_KEY=google-from-file\n",
        encoding="utf-8",
    )
    values = parse_env_file(path)
    assert values["GROQ_API_KEY"] == "groq-from-file"
    assert values["GOOGLE_GENAI_API_KEY"] == "google-from-file"


def test_load_shared_env_from_bstockwell_dev_root(tmp_path, monkeypatch) -> None:
    studio = tmp_path / "tabletop-studio"
    studio.mkdir()
    env_file = studio / ".env.local"
    env_file.write_text("GROQ_API_KEY=loaded-groq\n", encoding="utf-8")

    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("SHARED_ENV_FILE", raising=False)
    monkeypatch.setenv("BSTOCKWELL_DEV_ROOT", str(tmp_path))

    loaded = load_shared_env()
    assert loaded == env_file
    assert resolve_groq_api_key() == "loaded-groq"


def test_shared_env_file_explicit_wins(tmp_path, monkeypatch) -> None:
    env_file = tmp_path / "custom.env"
    env_file.write_text("GROQ_API_KEY=explicit\n", encoding="utf-8")

    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("SHARED_ENV_FILE", str(env_file))

    assert resolve_shared_env_file() == env_file
    load_shared_env()
    assert resolve_groq_api_key() == "explicit"


def test_resolve_model_uses_provider_default_for_demo_model() -> None:
    assert resolve_model_for_provider("groq", "qwen2.5:3b") == "llama-3.3-70b-versatile"
    assert resolve_model_for_provider("google", "qwen2.5:3b") == "gemini-2.5-flash"


def test_resolve_model_honors_ai_model_env(monkeypatch) -> None:
    monkeypatch.setenv("AI_MODEL", "custom-model")
    assert resolve_model_for_provider("groq", "qwen2.5:3b") == "custom-model"


@pytest.mark.asyncio
async def test_groq_posts_openai_compatible_chat(httpx_mock) -> None:
    httpx_mock.add_response(
        url="https://api.groq.com/openai/v1/chat/completions",
        json={"choices": [{"message": {"content": "technical"}}]},
    )

    model = GroqChatModel(model="llama-3.3-70b-versatile", api_key="groq-test")
    result = await model.generate(system_prompt="classify", user_prompt="database index")
    assert result == "technical"


@pytest.mark.asyncio
async def test_google_posts_generate_content(httpx_mock) -> None:
    httpx_mock.add_response(
        url="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=google-test",
        json={"candidates": [{"content": {"parts": [{"text": "technical"}]}}]},
    )

    model = GoogleGenAIChatModel(model="gemini-2.5-flash", api_key="google-test")
    result = await model.generate(system_prompt="classify", user_prompt="database index")
    assert result == "technical"


@pytest.mark.asyncio
async def test_google_maps_assistant_history_role_to_model(httpx_mock) -> None:
    httpx_mock.add_response(
        url="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=google-test",
        json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]},
    )

    model = GoogleGenAIChatModel(model="gemini-2.5-flash", api_key="google-test")
    await model.generate(
        system_prompt=None,
        user_prompt="and now?",
        history=[
            {"role": "user", "content": "first turn"},
            {"role": "assistant", "content": "first reply"},
        ],
    )

    request = httpx_mock.get_request()
    assert request is not None
    body = json.loads(request.read())
    assert body["contents"] == [
        {"role": "user", "parts": [{"text": "first turn"}]},
        {"role": "model", "parts": [{"text": "first reply"}]},
        {"role": "user", "parts": [{"text": "and now?"}]},
    ]


def test_factory_returns_groq_and_google() -> None:
    groq = get_chat_model(provider=ChatProvider.GROQ.value)
    google = get_chat_model(provider=ChatProvider.GOOGLE.value)
    assert groq.provider_name == "groq"
    assert google.provider_name == "google"


def test_ai_provider_env_maps_to_groq(monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "groq")
    monkeypatch.delenv("CHAT_PROVIDER", raising=False)
    assert resolve_chat_provider(None) == ChatProvider.GROQ
