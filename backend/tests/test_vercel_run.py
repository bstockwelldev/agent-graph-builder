"""Serverless (Vercel) run path: await execution in the HTTP request."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import storage
from app.demo_graph import build_demo_graph
from app.main import app

client = TestClient(app)


def _enable_vercel_runtime(monkeypatch) -> None:
    """Run-path tests use local SQLite; bypass fail-closed gate for runtime behavior."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(storage, "storage_is_healthy", lambda: True)


def test_vercel_run_returns_terminal_status(monkeypatch) -> None:
    _enable_vercel_runtime(monkeypatch)
    graph = build_demo_graph()
    storage.save_graph(graph)

    response = client.post(
        "/api/runs",
        json={
            "graph_id": graph.id,
            "input": {"question": "How does a database index work?"},
            "provider": "stub",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] in ("succeeded", "failed")
    assert payload["completed_at"] is not None
    assert payload["status"] == "succeeded"


def test_vercel_run_includes_events_in_response(monkeypatch) -> None:
    _enable_vercel_runtime(monkeypatch)
    graph = build_demo_graph()
    storage.save_graph(graph)

    response = client.post(
        "/api/runs",
        json={
            "graph_id": graph.id,
            "input": {"question": "How does a database index work?"},
            "provider": "stub",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    event_types = [event["event_type"] for event in payload.get("events", [])]
    assert "run.started" in event_types
    assert "run.completed" in event_types


def test_vercel_run_seeds_node_outputs(monkeypatch) -> None:
    """Phase 10 Slice C, "Run from selected node" (docs/planning/features/
    studio-shell-ux-gap-analysis.md): RunRequest.node_outputs threads
    through to runtime.start_run's existing fixture_node_outputs param, so
    a seeded node short-circuits instead of invoking its real executor —
    the same mechanism P1 fixture-simulation already exercises via
    /api/graphs/{id}/simulate, now reachable from the real run endpoint."""
    _enable_vercel_runtime(monkeypatch)
    graph = build_demo_graph()
    storage.save_graph(graph)

    response = client.post(
        "/api/runs",
        json={
            "graph_id": graph.id,
            "input": {"question": "How does a database index work?"},
            "provider": "stub",
            # Mocking llm_classify's output also forces router_1's branch
            # deterministically ("other" doesn't match the "technical"
            # conditional edge, so it takes the default edge to
            # prompt_answer) — this is exactly what "Run from selected
            # node" produces when a node downstream of the classifier is
            # selected and everything upstream is mocked.
            "node_outputs": {"llm_classify": "other"},
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "succeeded"
    events_by_type = [
        (event["event_type"], event.get("node_id")) for event in payload.get("events", [])
    ]
    completed_events = [
        event
        for event in payload.get("events", [])
        if event["event_type"] == "node.completed" and event["node_id"] == "llm_classify"
    ]
    assert len(completed_events) == 1
    assert completed_events[0]["payload"]["fixture"] is True
    assert completed_events[0]["payload"]["output"] == "other"
    assert ("node.started", "prompt_answer") in events_by_type
    assert ("node.started", "tool_lookup") not in events_by_type


def test_local_run_returns_queued() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)

    response = client.post(
        "/api/runs",
        json={
            "graph_id": graph.id,
            "input": {"question": "How does a database index work?"},
            "provider": "stub",
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] in ("queued", "running", "succeeded")


def test_events_without_bus_returns_empty_sse() -> None:
    response = client.get("/api/runs/run_missing_bus/events")
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")
    assert "no live bus" in response.text
