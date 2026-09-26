"""Shared helpers for runtime integration tests."""

from __future__ import annotations

from app import runtime
from app.demo_graph import build_demo_graph
from app.models import GraphDefinition


def editable_demo_graph() -> GraphDefinition:
    """The demo under its own id -- the seeded demo itself is read-only."""
    return build_demo_graph().model_copy(update={"id": "demo_copy"})


async def run_graph_and_wait(
    compiled_workflow_id: str,
    question: str,
    *,
    provider: str = "stub",
) -> str:
    run_id, bus = runtime.start_run(
        compiled_workflow_id,
        {"question": question},
        provider=provider,
    )
    async for _ in bus.stream():
        pass
    summary = runtime.RUN_STORE[run_id]
    assert summary.status == "succeeded", f"run failed: {summary}"
    return run_id
