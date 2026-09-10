"""Serverless (Vercel) run path: await execution in the HTTP request."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import storage
from app.demo_graph import build_demo_graph
from app.main import app

client = TestClient(app)


def test_vercel_run_returns_terminal_status(monkeypatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
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
    monkeypatch.setenv("VERCEL", "1")
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
