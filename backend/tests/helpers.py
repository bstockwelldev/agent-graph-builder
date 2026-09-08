"""Shared helpers for runtime integration tests."""

from __future__ import annotations

from app import runtime


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
