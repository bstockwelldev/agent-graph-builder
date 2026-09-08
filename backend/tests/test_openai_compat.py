"""OpenAI-compatible provider adapter tests (mocked HTTP, no network)."""

from __future__ import annotations

import pytest

from app.providers.base import ChatProvider, get_chat_model
from app.providers.openai_compat import OpenAICompatChatModel


@pytest.mark.asyncio
async def test_openai_compat_posts_chat_completions(httpx_mock) -> None:
    httpx_mock.add_response(
        url="https://api.example.com/v1/chat/completions",
        json={"choices": [{"message": {"content": "technical"}}]},
    )

    model = OpenAICompatChatModel(
        model="gpt-4o-mini",
        api_key="test-key",
        base_url="https://api.example.com/v1",
    )
    result = await model.generate(
        system_prompt="Classify as technical or other",
        user_prompt="How does a database index work?",
    )

    assert result == "technical"
    request = httpx_mock.get_request()
    assert request is not None
    assert request.headers["authorization"] == "Bearer test-key"
    body = request.read().decode()
    assert "gpt-4o-mini" in body
    assert "database index" in body


@pytest.mark.asyncio
async def test_openai_compat_omits_auth_when_no_api_key(httpx_mock) -> None:
    httpx_mock.add_response(
        url="http://localhost:1234/v1/chat/completions",
        json={"choices": [{"message": {"content": "ok"}}]},
    )

    model = OpenAICompatChatModel(model="local-model", api_key="", base_url="http://localhost:1234/v1")
    result = await model.generate(system_prompt=None, user_prompt="hello")

    assert result == "ok"
    request = httpx_mock.get_request()
    assert request is not None
    assert "authorization" not in request.headers


def test_factory_returns_openai_compat_adapter() -> None:
    model = get_chat_model("gpt-4o-mini", provider=ChatProvider.OPENAI_COMPAT.value)
    assert model.provider_name == "openai_compat"
    assert model.model == "gpt-4o-mini"
