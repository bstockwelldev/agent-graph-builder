"""Provider credential metadata for the Run panel (local dev POC).

Returns configured env values so the UI can prepopulate key fields. Keys are
never persisted server-side from run requests — only used for that execution.
"""

from __future__ import annotations

from typing import Callable

from .env_config import (
    resolve_azure_api_key,
    resolve_google_api_key,
    resolve_groq_api_key,
    resolve_openai_compat_api_key,
)

CredentialResolver = Callable[[], str]

PROVIDER_API_KEY_FIELDS: dict[str, dict[str, str | CredentialResolver]] = {
    "groq": {
        "label": "API key",
        "env_var": "GROQ_API_KEY",
        "resolve": resolve_groq_api_key,
    },
    "google": {
        "label": "API key",
        "env_var": "GOOGLE_GENAI_API_KEY",
        "resolve": resolve_google_api_key,
    },
    "azure": {
        "label": "API key",
        "env_var": "AZURE_OPENAI_API_KEY",
        "resolve": resolve_azure_api_key,
    },
    "openai_compat": {
        "label": "API key",
        "env_var": "OPENAI_COMPAT_API_KEY",
        "resolve": resolve_openai_compat_api_key,
    },
}


def provider_requires_api_key(provider: str) -> bool:
    return provider in PROVIDER_API_KEY_FIELDS


def get_provider_credentials(provider: str) -> dict[str, str | bool]:
    field = PROVIDER_API_KEY_FIELDS.get(provider)
    if field is None:
        return {"provider": provider, "requires_api_key": False, "label": "", "env_var": "", "configured": False, "value": ""}

    resolve = field["resolve"]
    assert callable(resolve)
    value = resolve()
    return {
        "provider": provider,
        "requires_api_key": True,
        "label": str(field["label"]),
        "env_var": str(field["env_var"]),
        "configured": bool(value),
        "value": value,
    }
