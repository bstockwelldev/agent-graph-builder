"""Telemetry provider selection (studio-consolidation Phase 5). Ported from
micro-ui-agent-builder's `lib/server/telemetry/provider.ts`
`getServerTelemetry`.
"""

from __future__ import annotations

from ..env_config import (
    resolve_langfuse_host,
    resolve_langfuse_public_key,
    resolve_langfuse_secret_key,
    telemetry_provider,
)
from .noop import NoopTelemetry
from .types import ServerTelemetry

_noop_singleton = NoopTelemetry()


def get_server_telemetry() -> ServerTelemetry:
    """Returns the configured telemetry backend. Falls back to the noop
    backend (rather than raising) when `TELEMETRY_PROVIDER=langfuse` is
    misconfigured — telemetry is diagnostic, not load-bearing, so a bad
    Langfuse key pair should degrade runs to "untraced", not break them.
    `telemetry_health()` is what surfaces the misconfiguration on
    `/api/health`.
    """
    try:
        provider = telemetry_provider()
    except Exception:
        return _noop_singleton
    if provider == "noop":
        return _noop_singleton

    from .langfuse_telemetry import get_langfuse_telemetry

    return get_langfuse_telemetry(
        public_key=resolve_langfuse_public_key(),
        secret_key=resolve_langfuse_secret_key(),
        host=resolve_langfuse_host(),
    )
