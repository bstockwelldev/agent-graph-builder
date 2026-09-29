"""Slice 4 (resource-forms-consistency-plan): graph scope for the
Analytics, Policies and Resources pages."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.analytics import RunUsage, get_analytics_dashboard
from app.main import app
from app.models import EdgeTransform
from tests.helpers import editable_demo_graph


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("PUBLIC_DEMO_MODE", raising=False)
    with TestClient(app) as client:
        yield client


def test_graph_resources_lists_bindings_mcp_servers_and_agents(api: TestClient) -> None:
    graph = editable_demo_graph()
    for node in graph.nodes:
        if node.id == "llm_answer":
            node.config = {**node.config, "systemPromptId": "tone", "llmProfileId": "fast"}
        if node.id == "tool_lookup":
            node.config = {**node.config, "toolName": "docs.search"}
    for edge in graph.edges:
        if edge.id == "e_tool_output":
            edge.transform = EdgeTransform(transform_id="topic_line")
    assert api.put(f"/api/graphs/{graph.id}", json=graph.model_dump(mode="json")).status_code == 200
    storage.save_resource(
        "tools",
        "docs.search",
        {"id": "docs.search", "description": "d", "mcp_server_id": "srv", "mcp_tool_name": "s"},
    )
    storage.save_resource("agents", "helper", {"id": "helper", "name": "H", "graph_id": graph.id})
    # A legacy agent record still counts.
    storage.save_resource(
        "agents", "old", {"id": "old", "name": "O", "default_flow_id": graph.id}
    )
    storage.save_resource("agents", "other", {"id": "other", "name": "X", "graph_id": "nope"})

    body = api.get(f"/api/graphs/{graph.id}/resources").json()
    assert body == {
        "graph_id": graph.id,
        "ids": {
            "prompts": ["tone"],
            "tools": ["docs.search"],
            "mcp-servers": ["srv"],
            "llm-profiles": ["fast"],
            "transforms": ["topic_line"],
            "agents": ["helper", "old"],
        },
    }
    assert api.get("/api/graphs/missing/resources").status_code == 404


def test_dashboard_narrows_to_one_graph(monkeypatch: pytest.MonkeyPatch) -> None:
    usages = [
        RunUsage(run_id="r1", graph_id="a", started_at="2026-09-29T10:00:00Z", input_tokens=4),
        RunUsage(run_id="r2", graph_id="b", started_at="2026-09-29T11:00:00Z", input_tokens=8),
    ]
    monkeypatch.setattr("app.analytics._usage_in_window", lambda window: usages)
    from datetime import date

    everything = get_analytics_dashboard(today=date(2026, 9, 29))
    only_a = get_analytics_dashboard(today=date(2026, 9, 29), graph_id="a")
    assert everything.totals.invocations == 2
    assert only_a.totals.invocations == 1
    assert only_a.totals.input_tokens == 4
    assert [row.graph_id for row in only_a.by_graph] == ["a"]
