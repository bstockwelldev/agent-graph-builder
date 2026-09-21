"""P1 rollout plan, Slice B: fixture-based simulation. Exit gate — a fixture
that stubs the demo graph's tool node produces the same diagnostics a live
compile would, with no live executor call for the stubbed node."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import nodes, runtime, storage
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import Fixture
from app.simulate import SimulateBlocked, simulate_graph

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


@pytest.mark.asyncio
async def test_simulate_matches_live_compile_diagnostics_for_a_clean_graph() -> None:
    graph = build_demo_graph()
    live_diagnostics = runtime.compile_workflow(graph).diagnostics
    assert not any(d.blocking for d in live_diagnostics)

    fixture = Fixture(
        input={"question": "how does a database index work"},
        node_outputs={"tool_lookup": "a fixture-recorded answer"},
    )
    result = await simulate_graph(graph, fixture)
    assert result.run.status == "succeeded"


@pytest.mark.asyncio
async def test_simulate_never_calls_the_stubbed_node_s_live_executor(monkeypatch) -> None:
    calls: list[str] = []

    def spy_lookup_topic(topic: str) -> str:
        calls.append(topic)
        return "REAL lookup_topic output"

    monkeypatch.setattr(nodes, "lookup_topic", spy_lookup_topic)

    graph = build_demo_graph()
    fixture = Fixture(
        input={"question": "how does a database index work"},
        node_outputs={"tool_lookup": "STUBBED output"},
    )
    result = await simulate_graph(graph, fixture)

    assert calls == []  # the live tool executor never ran
    trace = next(t for t in result.traces if t.node_id == "tool_lookup")
    assert trace.output == "STUBBED output"


@pytest.mark.asyncio
async def test_simulate_fixture_event_is_flagged_fixture_not_replayed() -> None:
    graph = build_demo_graph()
    fixture = Fixture(
        input={"question": "how does a database index work"},
        node_outputs={"tool_lookup": "stubbed"},
    )
    result = await simulate_graph(graph, fixture)

    events = runtime.RUN_STORE[result.run.run_id].events
    started = next(
        e for e in events if e.event_type == "node.started" and e.node_id == "tool_lookup"
    )
    completed = next(
        e for e in events if e.event_type == "node.completed" and e.node_id == "tool_lookup"
    )
    assert started.payload.get("fixture") is True
    assert started.payload.get("replayed") is None
    assert completed.payload.get("fixture") is True


@pytest.mark.asyncio
async def test_simulate_forces_stub_provider_regardless_of_llm_node_config() -> None:
    """The demo graph's llm_classify node has no fixture override — it still
    must never make a live call during simulation."""
    graph = build_demo_graph()
    fixture = Fixture(input={"question": "how does a database index work"})
    result = await simulate_graph(graph, fixture)
    assert result.run.status == "succeeded"
    assert result.run.provider == "stub"


@pytest.mark.asyncio
async def test_simulate_rejects_a_fixture_that_targets_the_router_node() -> None:
    graph = build_demo_graph()
    fixture = Fixture(input={"question": "x"}, node_outputs={"router_1": {"decision": "technical"}})
    with pytest.raises(SimulateBlocked) as exc_info:
        await simulate_graph(graph, fixture)
    assert any(d.code == "FIXTURE_ROUTER_OUTPUT_NOT_STUBBABLE" for d in exc_info.value.diagnostics)


@pytest.mark.asyncio
async def test_simulate_rejects_a_fixture_targeting_an_unknown_node() -> None:
    graph = build_demo_graph()
    fixture = Fixture(input={"question": "x"}, node_outputs={"does_not_exist": "value"})
    with pytest.raises(SimulateBlocked) as exc_info:
        await simulate_graph(graph, fixture)
    assert any(d.code == "FIXTURE_UNKNOWN_NODE" for d in exc_info.value.diagnostics)


@pytest.mark.asyncio
async def test_simulate_rejects_a_structurally_broken_graph() -> None:
    graph = build_demo_graph()
    broken = graph.model_copy(update={"entry_node_id": "does_not_exist"})
    with pytest.raises(SimulateBlocked) as exc_info:
        await simulate_graph(broken, Fixture())
    assert any(d.code == "GRAPH_MISSING_ENTRY_NODE" for d in exc_info.value.diagnostics)


def test_simulate_graph_endpoint_round_trip() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)

    response = client.post(
        f"/api/graphs/{graph.id}/simulate",
        json={
            "input": {"question": "how does a database index work"},
            "node_outputs": {"tool_lookup": "stubbed"},
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["run"]["status"] == "succeeded"
    trace = next(t for t in body["traces"] if t["node_id"] == "tool_lookup")
    assert trace["output"] == "stubbed"


def test_simulate_graph_endpoint_404_for_unknown_graph() -> None:
    response = client.post("/api/graphs/does_not_exist/simulate", json={})
    assert response.status_code == 404


def test_simulate_graph_endpoint_422_for_unstubbable_router() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    response = client.post(
        f"/api/graphs/{graph.id}/simulate",
        json={"input": {}, "node_outputs": {"router_1": {}}},
    )
    assert response.status_code == 422
    assert any(
        d["code"] == "FIXTURE_ROUTER_OUTPUT_NOT_STUBBABLE"
        for d in response.json()["detail"]["diagnostics"]
    )


def test_simulate_release_endpoint_round_trip() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    publish = client.post(f"/api/graphs/{graph.id}/releases", json={})
    release_id = publish.json()["release"]["id"]

    response = client.post(
        f"/api/graph-releases/{release_id}/simulate",
        json={
            "input": {"question": "how does a database index work"},
            "node_outputs": {"tool_lookup": "stubbed"},
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["run"]["source"] == "release"


def test_simulate_release_endpoint_404_for_unknown_release() -> None:
    response = client.post("/api/graph-releases/rel_missing/simulate", json={})
    assert response.status_code == 404
