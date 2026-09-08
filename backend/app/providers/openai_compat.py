"""OpenAI-compatible chat adapter (OpenAI, OpenRouter, LM Studio, etc.).

Uses the standard ``POST /v1/chat/completions`` shape over HTTP — no vendor
SDK — so the same adapter works anywhere that speaks the OpenAI chat API.
"""

from __future__ import annotations

import os

import httpx

OPENAI_COMPAT_BASE_URL = os.environ.get("OPENAI_COMPAT_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_COMPAT_API_KEY = os.environ.get("OPENAI_COMPAT_API_KEY", "")
OPENAI_COMPAT_DEFAULT_MODEL = os.environ.get("OPENAI_COMPAT_DEFAULT_MODEL", "gpt-4o-mini")
REQUEST_TIMEOUT_SECONDS = 180.0


class OpenAICompatChatModel:
    provider_name = "openai_compat"

    def __init__(
        self,
        model: str | None = None,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self.model = model or OPENAI_COMPAT_DEFAULT_MODEL
        self.api_key = OPENAI_COMPAT_API_KEY if api_key is None else api_key
        self.base_url = OPENAI_COMPAT_BASE_URL if base_url is None else base_url.rstrip("/")

    async def generate(self, *, system_prompt: str | None, user_prompt: str) -> str:
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        async with httpx.AsyncClient(base_url=self.base_url, timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                "/chat/completions",
                headers=headers,
                json={"model": self.model, "messages": messages},
            )
            response.raise_for_status()
            data = response.json()

        choices = data.get("choices") or []
        if not choices:
            raise ValueError("OpenAI-compatible response missing choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str):
            raise ValueError("OpenAI-compatible response missing message content")
        return content
