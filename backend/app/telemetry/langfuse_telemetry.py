"""Langfuse-backed telemetry (studio-consolidation Phase 5). Ported from
micro-ui-agent-builder's `lib/server/telemetry/langfuse.ts` `LangfuseTelemetry`
class — same trace-registry-by-id shape, same event names
(`model_<phase>`, `tool_<phase>`, `trace_error`).

Pinned to the langfuse Python SDK's 2.x `trace()`/`.event()`/`.update()` API
(see pyproject.toml) rather than the 3.x OpenTelemetry-based client: 2.x's
shape matches the JS SDK's `client.trace(...)` API this module ports
line-for-line, and there's no live Langfuse instance in this environment to
validate the 3.x API against. `langfuse` is only imported inside this
module's functions, not at module scope, so a `TELEMETRY_PROVIDER=noop`
deployment (the default) never needs the package installed at all.
"""

from __future__ import annotations

from typing import Any

from .types import TelemetryModelEvent, TelemetryStatus, TelemetryToolEvent, TelemetryTraceContext


class LangfuseTelemetry:
    def __init__(self, client: Any) -> None:
        self._client = client
        self._traces: dict[str, Any] = {}

    def start_trace(self, context: TelemetryTraceContext) -> None:
        trace = self._client.trace(
            id=context.trace_id,
            name="agent_run",
            session_id=context.run_id,
            metadata={"graphId": context.graph_id, "runId": context.run_id},
        )
        self._traces[context.trace_id] = trace

    def record_model_event(self, trace_id: str, event: TelemetryModelEvent) -> None:
        trace = self._traces.get(trace_id)
        if trace is None:
            return
        trace.event(
            name=f"model_{event.phase}",
            metadata={"provider": event.provider, "model": event.model, **event.metadata},
        )

    def record_tool_event(self, trace_id: str, event: TelemetryToolEvent) -> None:
        trace = self._traces.get(trace_id)
        if trace is None:
            return
        trace.event(
            name=f"tool_{event.phase}",
            metadata={"toolName": event.tool_name, **event.metadata},
        )

    def capture_error(
        self, trace_id: str, error: BaseException, metadata: dict[str, Any] | None = None
    ) -> None:
        trace = self._traces.get(trace_id)
        if trace is None:
            return
        trace.event(
            name="trace_error",
            level="ERROR",
            metadata={"error": str(error), **(metadata or {})},
        )

    def finish_trace(
        self, trace_id: str, status: TelemetryStatus, metadata: dict[str, Any] | None = None
    ) -> None:
        trace = self._traces.pop(trace_id, None)
        if trace is None:
            return
        trace.update(output={"status": status, **(metadata or {})})
        self._client.flush()


_singleton: LangfuseTelemetry | None = None


def get_langfuse_telemetry(
    *, public_key: str, secret_key: str, host: str
) -> LangfuseTelemetry:
    global _singleton
    if _singleton is not None:
        return _singleton

    from langfuse import Langfuse

    client = Langfuse(public_key=public_key, secret_key=secret_key, host=host)
    _singleton = LangfuseTelemetry(client)
    return _singleton
