"""Provider default models and shared model resolution."""

from __future__ import annotations

from .env_config import resolve_ai_model_override

# Canonical demo graph LLM config; not valid on cloud providers.
DEMO_LLM_MODEL = "qwen2.5:3b"

# Defaults aligned with tabletop-studio `src/services/ai/config.ts`
PROVIDER_DEFAULT_MODELS: dict[str, str] = {
    "stub": "stub",
    "ollama": DEMO_LLM_MODEL,
    "openai_compat": "gpt-4o-mini",
    "groq": "llama-3.3-70b-versatile",
    "google": "gemini-2.5-flash",
}


def resolve_model_for_provider(provider: str, model: str | None) -> str:
    if model and model not in {DEMO_LLM_MODEL, "stub"}:
        return model
    override = resolve_ai_model_override()
    if override:
        return override
    return PROVIDER_DEFAULT_MODELS.get(provider, DEMO_LLM_MODEL)
