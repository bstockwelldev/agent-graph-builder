"""Trimmed internal event protocol (EDD section 26.2) + a per-run SSE bus.

Each run gets an asyncio.Queue that node executors push events onto; the SSE
endpoint in main.py drains it. This is the "streamed execution events" leg of
the demo loop.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel

EventType = Literal[
    "run.started",
    "run.completed",
    "run.failed",
    # Added for the `human_gate` node type (studio-consolidation Phase 2,
    # see docs/planning/features/studio-consolidation-plan.md). A paused run
    # is a terminal outcome for its current event bus, same as
    # completed/failed; POST /api/runs/{id}/resume starts a fresh bus for
    # the same run_id and emits run.resumed on it.
    "run.paused",
    "run.resumed",
    # P0 graph foundation, Slice D (design doc, "Version-pinned runs and
    # Studio UX"): emitted once, right after the run's RunGraphSnapshot is
    # durably persisted, before compiling. The design doc also names
    # run.compilation_started/completed and contract.validated/violation
    # ("only as real state becomes available") — those aren't added here:
    # compilation happens via a separate route with no run/bus context yet,
    # so there's no real state to emit them from without a larger
    # restructuring outside this slice's scope.
    "run.snapshot_created",
    "node.started",
    "node.completed",
    "node.failed",
    "node.paused",
    "edge.selected",
]


class PlatformEvent(BaseModel):
    event_type: EventType
    run_id: str
    node_id: str | None = None
    occurred_at: str
    sequence: int
    payload: dict[str, Any]


class RunEventBus:
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self._queue: asyncio.Queue[PlatformEvent | None] = asyncio.Queue()
        self._seq = 0
        self._collected: list[PlatformEvent] = []

    def emit(
        self, event_type: EventType, payload: dict[str, Any], node_id: str | None = None
    ) -> PlatformEvent:
        self._seq += 1
        event = PlatformEvent(
            event_type=event_type,
            run_id=self.run_id,
            node_id=node_id,
            occurred_at=datetime.now(UTC).isoformat(),
            sequence=self._seq,
            payload=payload,
        )
        self._collected.append(event)
        self._queue.put_nowait(event)
        return event

    def collected_events(self) -> list[PlatformEvent]:
        return list(self._collected)

    def close(self) -> None:
        self._queue.put_nowait(None)

    async def stream(self):
        while True:
            event = await self._queue.get()
            if event is None:
                break
            yield event


_BUSES: dict[str, RunEventBus] = {}


def create_bus(run_id: str) -> RunEventBus:
    bus = RunEventBus(run_id)
    _BUSES[run_id] = bus
    return bus


def get_bus(run_id: str) -> RunEventBus | None:
    return _BUSES.get(run_id)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def monotonic_ms() -> float:
    return time.monotonic() * 1000
