"""Load shared AI keys from a sibling repo `.env.local` (e.g. tabletop-studio).

Never hardcode machine-specific paths in git. Resolution order:

1. ``SHARED_ENV_FILE`` — explicit path to a dotenv file
2. ``$BSTOCKWELL_DEV_ROOT/tabletop-studio/.env.local`` when that file exists
3. Skip silently (process env / backend ``.env`` already set)

Only sets variables that are not already present in ``os.environ``.
"""

from __future__ import annotations

import os
from pathlib import Path

TABLETOP_STUDIO_ENV_RELATIVE = Path("tabletop-studio") / ".env.local"

# Env names aligned with tabletop-studio `env.template` / `src/config/ai.ts`
GROQ_API_KEY_NAMES = ("GROQ_API_KEY",)
GOOGLE_API_KEY_NAMES = ("GOOGLE_GENAI_API_KEY", "GOOGLE_API_KEY")
AZURE_OPENAI_API_KEY_NAMES = ("AZURE_OPENAI_API_KEY",)
AZURE_OPENAI_DEFAULT_API_VERSION = "2024-02-15-preview"


def resolve_local_env_file() -> Path | None:
    """Repo-local ``.env.local`` (backend/ or repo root). Never commit this file."""
    backend_dir = Path(__file__).resolve().parent.parent
    for candidate in (backend_dir / ".env.local", backend_dir.parent / ".env.local"):
        if candidate.is_file():
            return candidate
    return None


def load_local_env(*, override: bool = False) -> Path | None:
    """Merge repo-local dotenv into ``os.environ``. Returns the file path if loaded."""
    path = resolve_local_env_file()
    if path is None:
        return None

    for key, value in parse_env_file(path).items():
        if override or key not in os.environ:
            os.environ[key] = value
    return path


def load_app_env(*, override: bool = False) -> None:
    """Load local repo secrets first, then optional shared sibling-repo dotenv."""
    load_local_env(override=override)
    load_shared_env(override=override)


def resolve_shared_env_file() -> Path | None:
    explicit = os.environ.get("SHARED_ENV_FILE", "").strip()
    if explicit:
        path = Path(explicit)
        return path if path.is_file() else None

    dev_root = os.environ.get("BSTOCKWELL_DEV_ROOT", "").strip()
    if dev_root:
        candidate = Path(dev_root) / TABLETOP_STUDIO_ENV_RELATIVE
        if candidate.is_file():
            return candidate

    return None


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        key, sep, value = line.partition("=")
        if not sep:
            continue
        key = key.strip()
        if not key:
            continue
        values[key] = _strip_quotes(value.strip())
    return values


def load_shared_env(*, override: bool = False) -> Path | None:
    """Merge shared dotenv into ``os.environ``. Returns the file path if loaded."""
    path = resolve_shared_env_file()
    if path is None:
        return None

    for key, value in parse_env_file(path).items():
        if override or key not in os.environ:
            os.environ[key] = value
    return path


def first_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def resolve_groq_api_key() -> str:
    return first_env(*GROQ_API_KEY_NAMES)


def resolve_google_api_key() -> str:
    return first_env(*GOOGLE_API_KEY_NAMES)


def resolve_azure_api_key() -> str:
    return first_env(*AZURE_OPENAI_API_KEY_NAMES)


def resolve_azure_endpoint() -> str:
    return first_env("AZURE_OPENAI_ENDPOINT")


def resolve_azure_deployment_name() -> str:
    return first_env("AZURE_OPENAI_DEPLOYMENT_NAME")


def resolve_azure_api_version() -> str:
    return first_env("AZURE_OPENAI_API_VERSION") or AZURE_OPENAI_DEFAULT_API_VERSION


def resolve_ai_model_override() -> str | None:
    value = os.environ.get("AI_MODEL", "").strip()
    return value or None


def resolve_openai_compat_api_key() -> str:
    return first_env("OPENAI_COMPAT_API_KEY")


def public_demo_mode_enabled() -> bool:
    """``PUBLIC_DEMO_MODE`` marks an anonymous public deploy (no login, no
    sessions): server-side provider keys must not be spendable by visitors,
    so live providers run only with a key the caller sends."""
    return os.environ.get("PUBLIC_DEMO_MODE", "").strip().lower() in {"1", "true", "yes", "on"}


# --- Runtime config: telemetry provider selection (studio-consolidation
# Phase 5 — see docs/planning/features/studio-consolidation-plan.md).
# Ported from micro-ui-agent-builder's `lib/server/runtime-config.ts`,
# trimmed to the telemetry-provider subset: AGB has no `orchestrationBackend`
# toggle (`ai_sdk` vs `langgraph`) to port — it always runs the LangGraph
# engine, which is the whole point of this consolidation.

TelemetryProvider = str  # "noop" | "langfuse", kept as `str` to avoid a
# backend-wide Literal import just for two values compared with `==`.

LANGFUSE_DEFAULT_HOST = "https://cloud.langfuse.com"


class RuntimeConfigError(ValueError):
    """Raised when an env var combination for a runtime flag is invalid."""


def parse_telemetry_provider(raw: str | None) -> TelemetryProvider:
    normalized = (raw or "").strip().lower()
    if not normalized or normalized == "noop":
        return "noop"
    if normalized == "langfuse":
        return "langfuse"
    raise RuntimeConfigError(
        f'Invalid TELEMETRY_PROVIDER="{raw}". Use "noop" (default) or "langfuse".'
    )


def resolve_langfuse_public_key() -> str:
    return first_env("LANGFUSE_PUBLIC_KEY")


def resolve_langfuse_secret_key() -> str:
    return first_env("LANGFUSE_SECRET_KEY")


def resolve_langfuse_host() -> str:
    return first_env("LANGFUSE_HOST", "LANGFUSE_BASEURL") or LANGFUSE_DEFAULT_HOST


def telemetry_provider() -> TelemetryProvider:
    """The configured telemetry provider, validated. Raises `RuntimeConfigError`
    when `TELEMETRY_PROVIDER=langfuse` is set without both Langfuse keys —
    the same fail-loud posture MUI's `getServerRuntimeConfig` used.
    """
    provider = parse_telemetry_provider(os.environ.get("TELEMETRY_PROVIDER"))
    langfuse_ready = resolve_langfuse_public_key() and resolve_langfuse_secret_key()
    if provider == "langfuse" and not langfuse_ready:
        raise RuntimeConfigError(
            "TELEMETRY_PROVIDER=langfuse requires LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY. "
            "Set both values or switch TELEMETRY_PROVIDER=noop."
        )
    return provider


def telemetry_health() -> dict[str, bool | str]:
    """Cheap diagnostics payload for `/api/health` — mirrors `storage_health()`'s
    shape (`ok` + a `message` only when not ok) so both can sit side by side
    in the same response body.
    """
    requested = parse_telemetry_provider(os.environ.get("TELEMETRY_PROVIDER"))
    configured = bool(resolve_langfuse_public_key() and resolve_langfuse_secret_key())
    payload: dict[str, bool | str] = {
        "ok": True,
        "telemetry_provider": requested,
        "telemetry_configured": configured if requested == "langfuse" else True,
    }
    if requested == "langfuse" and not configured:
        payload["ok"] = False
        payload["message"] = (
            "TELEMETRY_PROVIDER=langfuse requires LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY."
        )
    return payload
