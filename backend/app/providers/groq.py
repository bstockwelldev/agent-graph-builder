"""Groq chat adapter — OpenAI-compatible API (tabletop-studio `GROQ_API_KEY`)."""

from __future__ import annotations

from ..env_config import resolve_groq_api_key
from ..provider_defaults import PROVIDER_DEFAULT_MODELS
from .openai_compat import OpenAICompatChatModel

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class GroqChatModel:
    provider_name = "groq"

    def __init__(self, model: str | None = None, *, api_key: str | None = None) -> None:
        self.model = model or PROVIDER_DEFAULT_MODELS["groq"]
        self._inner = OpenAICompatChatModel(
            model=self.model,
            api_key=resolve_groq_api_key() if api_key is None else api_key,
            base_url=GROQ_BASE_URL,
        )

    async def generate(
        self,
        *,
        system_prompt: str | None,
        user_prompt: str,
        history: list[dict[str, str]] | None = None,
    ) -> str:
        if not self._inner.api_key:
            raise ValueError(
                "Missing Groq API key. Set GROQ_API_KEY or load tabletop-studio/.env.local "
                "via BSTOCKWELL_DEV_ROOT or SHARED_ENV_FILE."
            )
        return await self._inner.generate(
            system_prompt=system_prompt, user_prompt=user_prompt, history=history
        )
