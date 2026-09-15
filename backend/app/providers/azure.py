"""Azure OpenAI chat adapter.

Uses deployment-scoped chat completions (not the OpenAI-compatible /v1 path).
Deployment id comes from the requested model or ``AZURE_OPENAI_DEPLOYMENT_NAME``.
"""

from __future__ import annotations

import httpx

from ..env_config import (
    resolve_azure_api_key,
    resolve_azure_api_version,
    resolve_azure_endpoint,
)
from ..provider_defaults import default_model_for_provider

REQUEST_TIMEOUT_SECONDS = 180.0


class AzureOpenAIChatModel:
    provider_name = "azure"

    def __init__(
        self,
        model: str | None = None,
        *,
        api_key: str | None = None,
        endpoint: str | None = None,
        api_version: str | None = None,
    ) -> None:
        self.model = model or default_model_for_provider("azure")
        self.api_key = resolve_azure_api_key() if api_key is None else api_key
        self.endpoint = (resolve_azure_endpoint() if endpoint is None else endpoint).rstrip("/")
        self.api_version = resolve_azure_api_version() if api_version is None else api_version

    async def generate(self, *, system_prompt: str | None, user_prompt: str) -> str:
        if not self.api_key:
            raise ValueError(
                "Missing Azure OpenAI API key. Set AZURE_OPENAI_API_KEY or load "
                "tabletop-studio/.env.local via BSTOCKWELL_DEV_ROOT or SHARED_ENV_FILE."
            )
        if not self.endpoint:
            raise ValueError(
                "Missing Azure OpenAI endpoint. Set AZURE_OPENAI_ENDPOINT to your resource URL "
                "(e.g. https://<resource>.openai.azure.com)."
            )
        if not self.model:
            raise ValueError(
                "Missing Azure OpenAI deployment. Set AZURE_OPENAI_DEPLOYMENT_NAME or pass "
                "a deployment id."
            )

        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        async with httpx.AsyncClient(
            base_url=self.endpoint, timeout=REQUEST_TIMEOUT_SECONDS
        ) as client:
            response = await client.post(
                f"/openai/deployments/{self.model}/chat/completions",
                params={"api-version": self.api_version},
                headers={"api-key": self.api_key, "Content-Type": "application/json"},
                json={"messages": messages},
            )
            response.raise_for_status()
            data = response.json()

        choices = data.get("choices") or []
        if not choices:
            raise ValueError("Azure OpenAI response missing choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str):
            raise ValueError("Azure OpenAI response missing message content")
        return content
