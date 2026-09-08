"""Provider credential metadata for the Run panel (local dev POC).

Tells the UI whether a provider's API key is already configured server-side
(via env var) so it can say so, WITHOUT ever sending the key's actual value
over the wire -- the browser has no legitimate need to see a secret it isn't
the one holding. Keys a user types into the Run panel to override the
server's own are sent with that run request and never persisted server-side.
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
    """Never include the resolved key value in the return -- only whether one
    is configured. See module docstring."""
    field = PROVIDER_API_KEY_FIELDS.get(provider)
    if field is None:
        return {"provider": provider, "requires_api_key": False, "label": "", "env_var": "", "configured": False}

    resolve = field["resolve"]
    assert callable(resolve)
    configured = bool(resolve())
    return {
        "provider": provider,
        "requires_api_key": True,
        "label": str(field["label"]),
        "env_var": str(field["env_var"]),
        "configured": configured,
    }
