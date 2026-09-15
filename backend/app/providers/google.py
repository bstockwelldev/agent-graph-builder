"""Google Gemini chat adapter (Generative Language API).

Uses the same env keys as tabletop-studio: ``GOOGLE_GENAI_API_KEY`` or
``GOOGLE_API_KEY``.
"""

from __future__ import annotations

import os

import httpx

from ..env_config import resolve_google_api_key
from ..provider_defaults import PROVIDER_DEFAULT_MODELS

GOOGLE_GENAI_BASE_URL = os.environ.get(
    "GOOGLE_GENAI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta",
).rstrip("/")
REQUEST_TIMEOUT_SECONDS = 180.0


class GoogleGenAIChatModel:
    provider_name = "google"

    def __init__(self, model: str | None = None, *, api_key: str | None = None) -> None:
        self.model = model or PROVIDER_DEFAULT_MODELS["google"]
        self.api_key = resolve_google_api_key() if api_key is None else api_key

    async def generate(self, *, system_prompt: str | None, user_prompt: str) -> str:
        if not self.api_key:
            raise ValueError(
                "Missing Google GenAI API key. Set GOOGLE_GENAI_API_KEY or GOOGLE_API_KEY, "
                "or load tabletop-studio/.env.local via BSTOCKWELL_DEV_ROOT or SHARED_ENV_FILE."
            )

        body: dict = {
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        }
        if system_prompt:
            body["systemInstruction"] = {"parts": [{"text": system_prompt}]}

        async with httpx.AsyncClient(
            base_url=GOOGLE_GENAI_BASE_URL, timeout=REQUEST_TIMEOUT_SECONDS
        ) as client:
            response = await client.post(
                f"/models/{self.model}:generateContent",
                params={"key": self.api_key},
                json=body,
            )
            response.raise_for_status()
            data = response.json()

        candidates = data.get("candidates") or []
        if not candidates:
            raise ValueError("Google GenAI response missing candidates")
        content = candidates[0].get("content") or {}
        parts = content.get("parts") or []
        texts = [part.get("text") for part in parts if isinstance(part.get("text"), str)]
        if not texts:
            raise ValueError("Google GenAI response missing text content")
        return "".join(texts)
