"""Default telemetry backend — every call is a no-op (studio-consolidation
Phase 5). Ported from micro-ui-agent-builder's `lib/server/telemetry/noop.ts`
`createNoopTelemetry`; its `createConsoleTelemetry` sibling isn't ported —
AGB already has structured per-node observability via `RunEventBus`/SSE, so
a console-only telemetry tier would just duplicate that.
"""

from __future__ import annotations

from typing import Any

from .types import TelemetryModelEvent, TelemetryStatus, TelemetryToolEvent, TelemetryTraceContext


class NoopTelemetry:
    def start_trace(self, context: TelemetryTraceContext) -> None:
        pass

    def record_model_event(self, trace_id: str, event: TelemetryModelEvent) -> None:
        pass

    def record_tool_event(self, trace_id: str, event: TelemetryToolEvent) -> None:
        pass

    def capture_error(
        self, trace_id: str, error: BaseException, metadata: dict[str, Any] | None = None
    ) -> None:
        pass

    def finish_trace(
        self, trace_id: str, status: TelemetryStatus, metadata: dict[str, Any] | None = None
    ) -> None:
        pass
