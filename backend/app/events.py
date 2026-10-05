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
    # Decision node (decision_models/): emitted alongside edge.selected with
    # the validated outcome, confidence vs threshold, reason code, attempts,
    # and rule hit (if a deterministic rule decided without the model).
    "decision.made",
    # Wave 7c (STO-612): a subgraph node's nested child run finished.
    "subgraph.completed",
]


class PlatformEvent(BaseModel):
    event_type: EventType
    run_id: str
    node_id: str | None = None
    occurred_at: str
    sequence: int
    payload: dict[str, Any]


class RunEventBus:
    """A run's event log. SDK 2/7 (STO-615): a broadcast log rather than a
    single-consumer queue, so any number of SSE subscribers -- including a
    client reconnecting with `Last-Event-ID` -- each see every event, and
    `stream(after=n)` replays what they missed."""

    def __init__(self, run_id: str, start_sequence: int = 0) -> None:
        self.run_id = run_id
        self._seq = start_sequence
        self._collected: list[PlatformEvent] = []
        self._closed = False
        self._changed = asyncio.Event()

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
        self._notify()
        return event

    def collected_events(self) -> list[PlatformEvent]:
        return list(self._collected)

    def close(self) -> None:
        self._closed = True
        self._notify()

    def _notify(self) -> None:
        # Wake every waiting subscriber, then arm a fresh event for the next
        # change (asyncio.Event has no "pulse").
        changed, self._changed = self._changed, asyncio.Event()
        changed.set()

    async def stream(self, after: int = 0):
        """Every event with `sequence > after` -- already emitted ones first,
        then live ones -- until the bus closes."""
        index = 0
        while True:
            while index < len(self._collected):
                event = self._collected[index]
                index += 1
                if event.sequence > after:
                    yield event
            if self._closed:
                return
            await self._changed.wait()


_BUSES: dict[str, RunEventBus] = {}


def create_bus(run_id: str, prior_events: list[PlatformEvent] | None = None) -> RunEventBus:
    """A run's bus. A resumed run (human_gate) passes the events it already
    has (from this process's previous bus or the stored run), so the new bus
    keeps them -- the run's final snapshot holds the whole history -- and its
    sequence numbers keep climbing for SSE ids / Last-Event-ID."""
    previous = _BUSES.get(run_id)
    history = list(prior_events) if prior_events is not None else (previous.collected_events() if previous else [])
    start = max((event.sequence for event in history), default=previous._seq if previous else 0)
    bus = RunEventBus(run_id, start_sequence=start)
    bus._collected = history
    _BUSES[run_id] = bus
    return bus


def get_bus(run_id: str) -> RunEventBus | None:
    return _BUSES.get(run_id)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def monotonic_ms() -> float:
    return time.monotonic() * 1000

