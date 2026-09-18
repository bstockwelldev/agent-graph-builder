"""Provider-neutral model interface (EDD section 11.1, trimmed to chat only).

The graph/runtime never talks to Ollama, Foundry, or any SDK directly -- only
to this protocol. Swapping providers means adding an adapter here, not
touching node executors or the compiler.
"""

from __future__ import annotations

import os
from enum import StrEnum
from typing import Protocol

from ..provider_defaults import resolve_model_for_provider


class ChatProvider(StrEnum):
    OLLAMA = "ollama"
    STUB = "stub"
    OPENAI_COMPAT = "openai_compat"
    GROQ = "groq"
    GOOGLE = "google"
    AZURE = "azure"


_AI_PROVIDER_TO_CHAT: dict[str, ChatProvider] = {
    "ollama": ChatProvider.OLLAMA,
    "stub": ChatProvider.STUB,
    "openai_compat": ChatProvider.OPENAI_COMPAT,
    "openai": ChatProvider.OPENAI_COMPAT,
    "groq": ChatProvider.GROQ,
    "google": ChatProvider.GOOGLE,
    "azure": ChatProvider.AZURE,
}


class ChatModel(Protocol):
    provider_name: str
    model: str

    async def generate(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        history: list[dict[str, str]] | None = None,
    ) -> str: ...


def resolve_chat_provider(explicit: str | None = None) -> ChatProvider:
    if explicit is not None:
        return ChatProvider(explicit)
    for env_name in ("CHAT_PROVIDER", "AI_PROVIDER"):
        raw = os.environ.get(env_name, "").strip().lower()
        if raw in _AI_PROVIDER_TO_CHAT:
            return _AI_PROVIDER_TO_CHAT[raw]
    return ChatProvider.OLLAMA


def get_chat_model(
    model: str | None = None, provider: str | None = None, *, api_key: str | None = None
) -> ChatModel:
    resolved = resolve_chat_provider(provider)
    resolved_model = resolve_model_for_provider(resolved, model)

    if resolved == ChatProvider.STUB:
        from .stub import StubChatModel

        return StubChatModel(model=resolved_model)
    if resolved == ChatProvider.OPENAI_COMPAT:
        from .openai_compat import OpenAICompatChatModel

        return OpenAICompatChatModel(model=resolved_model, api_key=api_key)
    if resolved == ChatProvider.GROQ:
        from .groq import GroqChatModel

        return GroqChatModel(model=resolved_model, api_key=api_key)
    if resolved == ChatProvider.GOOGLE:
        from .google import GoogleGenAIChatModel

        return GoogleGenAIChatModel(model=resolved_model, api_key=api_key)
    if resolved == ChatProvider.AZURE:
        from .azure import AzureOpenAIChatModel

        return AzureOpenAIChatModel(model=resolved_model, api_key=api_key)

    from .ollama import OllamaChatModel

    return OllamaChatModel(model=resolved_model)
