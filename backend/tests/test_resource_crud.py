"""Studio-consolidation Phase 3: generic resource CRUD routes (prompts,
tools, mcp-servers, agents, llm-profiles) and DELETE /api/graphs/{id}.

See docs/planning/features/studio-consolidation-plan.md.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.demo_graph import build_demo_graph
from app.main import app
from app import storage

client = TestClient(app)

# (route path segment, sample create body)
_RESOURCE_CASES = [
    ("prompts", {"id": "prompt_1", "name": "Greeting", "body": "You are helpful."}),
    ("tools", {"id": "tool_1", "description": "Does a thing"}),
    ("mcp-servers", {"id": "mcp_1", "name": "Test server", "url": "https://mcp.example.com/rpc"}),
    ("agents", {"id": "agent_1", "name": "Support agent"}),
    ("llm-profiles", {"id": "llm_1", "name": "Fast model", "model": "qwen2.5:3b"}),
]


@pytest.mark.parametrize("path,body", _RESOURCE_CASES)
def test_resource_crud_round_trip(path: str, body: dict) -> None:
    resource_id = body["id"]

    assert client.get(f"/api/{path}/{resource_id}").status_code == 404

    created = client.post(f"/api/{path}", json=body)
    assert created.status_code == 200, created.text
    assert created.json()["id"] == resource_id

    listed = client.get(f"/api/{path}")
    assert listed.status_code == 200
    assert any(item["id"] == resource_id for item in listed.json())

    fetched = client.get(f"/api/{path}/{resource_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == resource_id

    update_response = client.put(f"/api/{path}/{resource_id}", json={**body})
    assert update_response.status_code == 200

    mismatched = client.put(f"/api/{path}/not-{resource_id}", json={**body})
    assert mismatched.status_code == 400

    deleted = client.delete(f"/api/{path}/{resource_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}

    assert client.delete(f"/api/{path}/{resource_id}").status_code == 404
    assert client.get(f"/api/{path}/{resource_id}").status_code == 404


def test_tool_resource_accepts_optional_mcp_binding_fields() -> None:
    body = {
        "id": "tool_mcp",
        "description": "Bound to an MCP server",
        "requires_approval": True,
        "mcp_server_id": "mcp_1",
        "mcp_tool_name": "search",
    }
    response = client.post("/api/tools", json=body)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["requires_approval"] is True
    assert payload["mcp_server_id"] == "mcp_1"
    assert payload["mcp_tool_name"] == "search"
    client.delete("/api/tools/tool_mcp")


def test_invalid_resource_body_returns_422() -> None:
    # PromptTemplate requires name+body; omit both.
    response = client.post("/api/prompts", json={"id": "bad_prompt"})
    assert response.status_code == 422


def test_delete_graph_removes_it() -> None:
    graph = build_demo_graph().model_copy(update={"id": "graph_to_delete"})
    storage.save_graph(graph)
    assert storage.get_graph("graph_to_delete") is not None

    response = client.delete("/api/graphs/graph_to_delete")
    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert storage.get_graph("graph_to_delete") is None

    assert client.delete("/api/graphs/graph_to_delete").status_code == 404


def test_delete_unknown_graph_returns_404() -> None:
    assert client.delete("/api/graphs/graph_never_existed").status_code == 404
