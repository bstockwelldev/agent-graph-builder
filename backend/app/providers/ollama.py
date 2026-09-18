"""Ollama chat adapter -- local dev provider (EDD section 11.3).

Talks to Ollama's REST API directly rather than through a heavier SDK, since
the only contract the rest of the system depends on is `ChatModel`.
"""

from __future__ import annotations

import os

import httpx

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")


class OllamaChatModel:
    provider_name = "ollama"

    def __init__(self, model: str = "qwen2.5:3b") -> None:
        self.model = model

    async def generate(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        history: list[dict[str, str]] | None = None,
    ) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": user_prompt})

        # A local Ollama instance can be slow under contention (e.g. another
        # process holding a larger model loaded) rather than genuinely stuck,
        # so this is generous rather than a tight liveness check.
        async with httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=180.0) as client:
            response = await client.post(
                "/api/chat",
                json={"model": self.model, "messages": messages, "stream": False},
            )
            response.raise_for_status()
            data = response.json()
            return data["message"]["content"]


def get_ollama_chat_model(model: str | None = None) -> OllamaChatModel:
    return OllamaChatModel(model=model or "qwen2.5:3b")
