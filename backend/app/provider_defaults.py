"""Provider default models and shared model resolution."""

from __future__ import annotations

from .env_config import resolve_ai_model_override, resolve_azure_deployment_name

# Canonical demo graph LLM config; not valid on cloud providers.
DEMO_LLM_MODEL = "qwen2.5:3b"

# Defaults aligned with tabletop-studio `src/services/ai/config.ts`
PROVIDER_DEFAULT_MODELS: dict[str, str] = {
    "stub": "stub",
    "ollama": DEMO_LLM_MODEL,
    "openai_compat": "gpt-4o-mini",
    "groq": "llama-3.3-70b-versatile",
    "google": "gemini-2.5-flash",
    "azure": "gpt-4o-mini",
}

# Curated top-5 chat models per provider (one-time catalog pass; intersected with live IDs
# in ranking).
PROVIDER_PREFERRED_MODELS: dict[str, list[str]] = {
    "groq": [
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
        "qwen/qwen3.6-27b",
    ],
    "ollama": [
        "qwen2.5:3b",
        "llama3.2:latest",
        "llama3.1:8b",
        "mistral:latest",
        "gemma2:2b",
    ],
    "azure": [
        "gpt-4o-mini",
        "gpt-4o",
        "gpt-4",
        "gpt-35-turbo",
        "o1-mini",
    ],
    "google": [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
    ],
}


def default_model_for_provider(provider: str) -> str:
    if provider == "azure":
        return resolve_azure_deployment_name() or PROVIDER_DEFAULT_MODELS["azure"]
    return PROVIDER_DEFAULT_MODELS.get(provider, DEMO_LLM_MODEL)


def resolve_model_for_provider(provider: str, model: str | None) -> str:
    if model and model not in {DEMO_LLM_MODEL, "stub"}:
        return model
    override = resolve_ai_model_override()
    if override:
        return override
    return default_model_for_provider(provider)
