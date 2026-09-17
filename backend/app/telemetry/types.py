"""Telemetry event shapes (studio-consolidation Phase 5 — see
docs/planning/features/studio-consolidation-plan.md). Ported from
micro-ui-agent-builder's `lib/server/telemetry/types.ts`, trimmed to what
AGB's run lifecycle actually has data for: there is one trace kind (a graph
run — MUI's second kind, `agent_genui`, has no AGB equivalent) and no
per-token usage, since `ChatModel.generate` doesn't expose it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

TelemetryStatus = Literal["ok", "error"]
ModelEventPhase = Literal["model_selection", "generation_start", "generation_finish"]
ToolEventPhase = Literal["tool_call_start", "tool_call_finish", "tool_call_error"]


@dataclass
class TelemetryTraceContext:
    trace_id: str
    run_id: str
    graph_id: str | None = None


@dataclass
class TelemetryModelEvent:
    phase: ModelEventPhase
    provider: str | None = None
    model: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TelemetryToolEvent:
    phase: ToolEventPhase
    tool_name: str
    metadata: dict[str, Any] = field(default_factory=dict)


class ServerTelemetry(Protocol):
    def start_trace(self, context: TelemetryTraceContext) -> None: ...

    def record_model_event(self, trace_id: str, event: TelemetryModelEvent) -> None: ...

    def record_tool_event(self, trace_id: str, event: TelemetryToolEvent) -> None: ...

    def capture_error(
        self, trace_id: str, error: BaseException, metadata: dict[str, Any] | None = None
    ) -> None: ...

    def finish_trace(
        self, trace_id: str, status: TelemetryStatus, metadata: dict[str, Any] | None = None
    ) -> None: ...
