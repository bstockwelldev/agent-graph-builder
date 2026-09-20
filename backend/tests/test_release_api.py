"""P0 graph foundation, Slice C: release API routes and the end-to-end
reproducibility guarantee — a release-sourced run must be unaffected by a
resource mutation made to live storage after publish."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import runtime, storage
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import GraphEdge, GraphNode, NodePosition, NodeType

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _graph_with_tool_node(tool_node: GraphNode, graph_id: str):
    demo = build_demo_graph()
    edges = [e for e in demo.edges if e.id != "e_llmanswer_output"]
    edges.append(GraphEdge(id="e_llmanswer_tool", source="llm_answer", target=tool_node.id))
    edges.append(GraphEdge(id=f"e_{tool_node.id}_output", source=tool_node.id, target="output_1"))
    return demo.model_copy(
        update={"id": graph_id, "nodes": [*demo.nodes, tool_node], "edges": edges}
    )


def test_publish_get_list_release_round_trip() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)

    publish_response = client.post(f"/api/graphs/{graph.id}/releases", json={})
    assert publish_response.status_code == 200, publish_response.text
    body = publish_response.json()
    assert body["created"] is True
    release_id = body["release"]["id"]

    list_response = client.get(f"/api/graphs/{graph.id}/releases")
    assert list_response.status_code == 200
    assert [r["release_id"] for r in list_response.json()] == [release_id]

    get_response = client.get(f"/api/graphs/{graph.id}/releases/{release_id}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == release_id


def test_publish_release_returns_422_with_diagnostics_when_blocked() -> None:
    node = GraphNode(
        id="tool_missing",
        type=NodeType.TOOL,
        position=NodePosition(x=0, y=0),
        config={"toolName": "does_not_exist"},
    )
    graph = _graph_with_tool_node(node, "graph_api_blocked")
    storage.save_graph(graph)

    response = client.post(f"/api/graphs/{graph.id}/releases", json={})

    assert response.status_code == 422
    assert any(
        d["code"] == "RELEASE_RESOURCE_UNRESOLVED" for d in response.json()["detail"]["diagnostics"]
    )


def test_publish_release_404_for_unknown_graph() -> None:
    response = client.post("/api/graphs/does_not_exist/releases", json={})
    assert response.status_code == 404


def test_publish_release_is_idempotent_via_api() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)

    first = client.post(f"/api/graphs/{graph.id}/releases", json={"release_notes": "v1"})
    second = client.post(f"/api/graphs/{graph.id}/releases", json={"release_notes": "v2"})

    assert first.json()["created"] is True
    assert second.json()["created"] is False
    assert first.json()["release"]["id"] == second.json()["release"]["id"]


def test_get_release_404_for_unknown_release_or_graph() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    assert client.get(f"/api/graphs/{graph.id}/releases/rel_missing").status_code == 404
    assert client.get("/api/graphs/does_not_exist/releases/rel_missing").status_code == 404


def test_compile_and_run_release_via_release_id_only_routes() -> None:
    """/api/graph-releases/{release_id}/... takes no graph_id — it must
    resolve the owning graph via storage.get_release_graph_id."""
    graph = build_demo_graph()
    storage.save_graph(graph)
    publish = client.post(f"/api/graphs/{graph.id}/releases", json={})
    release_id = publish.json()["release"]["id"]

    compile_response = client.post(f"/api/graph-releases/{release_id}/compile")
    assert compile_response.status_code == 200
    assert compile_response.json()["ok"] is True

    run_response = client.post(
        f"/api/graph-releases/{release_id}/runs",
        json={"input": {"question": "How does a database index work?"}, "provider": "stub"},
    )
    assert run_response.status_code == 200, run_response.text
    assert run_response.json()["status"] in ("succeeded", "queued", "running")


def test_compile_and_run_release_404_for_unknown_release() -> None:
    assert client.post("/api/graph-releases/rel_missing/compile").status_code == 404
    assert (
        client.post("/api/graph-releases/rel_missing/runs", json={"input": {}}).status_code == 404
    )


def test_runtime_target_capabilities_endpoint() -> None:
    response = client.get("/api/runtime-targets/langgraph/capabilities")
    assert response.status_code == 200
    body = response.json()
    assert body["target_id"] == "langgraph"
    features = {c["feature"] for c in body["capabilities"]}
    assert "cycles_unbounded_loops_parallel_fanout" in features
    assert not any(
        c["feature"] == "cycles_unbounded_loops_parallel_fanout" and c["supported"]
        for c in body["capabilities"]
    )


def test_runtime_target_capabilities_404_for_unknown_target() -> None:
    assert client.get("/api/runtime-targets/not_a_target/capabilities").status_code == 404


@pytest.mark.asyncio
async def test_release_run_uses_embedded_resource_snapshot_not_live_storage() -> None:
    """Exit gate: 'Editing a draft cannot change a published release or a
    run started from it.' Publishes a release with a tool that has no MCP
    binding (the mock-echo executor branch), then mutates the LIVE resource
    afterward to add a binding pointing at a server that doesn't exist. A
    release-sourced run must still take the mock-echo branch (using the
    embedded snapshot); a draft-sourced run of the same compiled workflow
    must see the mutation and fail trying to reach the now-referenced,
    nonexistent MCP server.
    """
    storage.save_resource("tools", "custom_tool", {"id": "custom_tool", "description": "d"})
    node = GraphNode(
        id="tool_custom",
        type=NodeType.TOOL,
        position=NodePosition(x=0, y=0),
        config={"toolName": "custom_tool"},
    )
    graph = _graph_with_tool_node(node, "graph_repro_api")
    storage.save_graph(graph)

    publish = client.post(f"/api/graphs/{graph.id}/releases", json={})
    assert publish.status_code == 200, publish.text
    release_payload = publish.json()["release"]
    assert release_payload["resource_snapshots"]["tools:custom_tool"].get("mcp_server_id") is None

    # Mutate the live resource after publish.
    storage.save_resource(
        "tools",
        "custom_tool",
        {
            "id": "custom_tool",
            "description": "d",
            "mcp_server_id": "srv_after_publish",
            "mcp_tool_name": "do_thing",
        },
    )

    compile_result = runtime.compile_workflow(graph)
    assert compile_result.ok, compile_result.diagnostics

    release_run_id, release_bus = runtime.start_run(
        compile_result.compiled_workflow_id,
        {"question": "hi"},
        provider="stub",
        release_resource_snapshots={k: v for k, v in release_payload["resource_snapshots"].items()},
    )
    async for _ in release_bus.stream():
        pass
    release_summary = runtime.RUN_STORE[release_run_id]
    assert release_summary.status == "succeeded", release_summary
    release_trace = runtime.RUN_TRACES[release_run_id]["tool_custom"]
    assert release_trace.output["note"] == "mock tool: no MCP binding registered"

    draft_run_id, draft_bus = runtime.start_run(
        compile_result.compiled_workflow_id, {"question": "hi"}, provider="stub"
    )
    async for _ in draft_bus.stream():
        pass
    draft_summary = runtime.RUN_STORE[draft_run_id]
    assert draft_summary.status == "failed"
    assert "srv_after_publish" in (draft_summary.error or "")
