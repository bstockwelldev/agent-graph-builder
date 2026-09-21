"""Fixture datasets (docs/planning/features/p1-rollout-plan.md, Slice D
follow-on): generic CRUD for saved Routing Lab datasets, plus capturing a
dataset from historical runs via POST /api/datasets/from-runs."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import runtime, storage
from app.datasets import MAX_RUNS_PER_DATASET
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import NodeType

client = TestClient(app)

_QUESTION = "how does a database index work"


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


async def _run_graph(graph, question: str = _QUESTION) -> str:
    compile_result = runtime.compile_workflow(graph)
    assert compile_result.ok, compile_result.diagnostics
    run_id, _bus = await runtime.start_run_inline(
        compile_result.compiled_workflow_id, {"question": question}, provider="stub"
    )
    return run_id


def _dataset_body(**overrides) -> dict:
    body = {
        "id": "ds_manual",
        "name": "Manual set",
        "fixtures": [{"input": {"question": "q"}, "node_outputs": {}}],
    }
    body.update(overrides)
    return body


# --- generic CRUD (saved Routing Lab datasets) ---------------------------


def test_dataset_crud_round_trip() -> None:
    created = client.post("/api/datasets", json=_dataset_body())
    assert created.status_code == 200, created.text
    assert created.json()["source"] == "manual"

    assert client.get("/api/datasets/ds_manual").json()["name"] == "Manual set"
    assert [d["id"] for d in client.get("/api/datasets").json()] == ["ds_manual"]

    updated = client.put("/api/datasets/ds_manual", json=_dataset_body(name="Renamed"))
    assert updated.status_code == 200
    assert client.get("/api/datasets/ds_manual").json()["name"] == "Renamed"

    assert client.delete("/api/datasets/ds_manual").json() == {"deleted": True}
    assert client.get("/api/datasets/ds_manual").status_code == 404


def test_dataset_create_rejects_a_malformed_fixture() -> None:
    response = client.post("/api/datasets", json=_dataset_body(fixtures=[{"input": "not-a-dict"}]))
    assert response.status_code == 422


# --- capture from runs ----------------------------------------------------


@pytest.mark.asyncio
async def test_from_runs_freezes_non_routing_node_outputs() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    run_id = await _run_graph(graph)
    traces = {t.node_id: t for t in runtime.get_run_node_traces(run_id)}
    routing_ids = {n.id for n in graph.nodes if n.type in {NodeType.ROUTER, NodeType.BRANCH}}
    assert routing_ids, "demo graph is expected to contain a router"

    response = client.post(
        "/api/datasets/from-runs", json={"name": "Captured", "run_ids": [run_id]}
    )

    assert response.status_code == 200, response.text
    dataset = response.json()
    assert dataset["source"] == "runs"
    assert dataset["source_run_ids"] == [run_id]
    assert dataset["graph_id"] == graph.id
    assert len(dataset["fixtures"]) == 1
    fixture = dataset["fixtures"][0]
    assert fixture["input"] == {"question": _QUESTION}
    assert fixture["node_outputs"], "a succeeded run should freeze at least one node output"
    assert not routing_ids & set(fixture["node_outputs"])
    for node_id, output in fixture["node_outputs"].items():
        assert output == traces[node_id].output
    # Persisted, so it can be loaded later.
    assert client.get(f"/api/datasets/{dataset['id']}").json()["name"] == "Captured"


@pytest.mark.asyncio
async def test_captured_dataset_runs_in_the_routing_lab() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    run_id = await _run_graph(graph)
    dataset = client.post(
        "/api/datasets/from-runs", json={"name": "Captured", "run_ids": [run_id]}
    ).json()

    report = client.post(
        f"/api/graphs/{graph.id}/routing-lab/run", json={"dataset": dataset["fixtures"]}
    )

    assert report.status_code == 200, report.text
    assert report.json()["dataset_size"] == 1


@pytest.mark.asyncio
async def test_from_runs_can_capture_inputs_only() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    run_id = await _run_graph(graph)

    response = client.post(
        "/api/datasets/from-runs",
        json={"name": "Inputs", "run_ids": [run_id], "include_node_outputs": False},
    )

    assert response.status_code == 200
    fixture = response.json()["fixtures"][0]
    assert fixture["input"] == {"question": _QUESTION}
    assert fixture["node_outputs"] == {}


@pytest.mark.asyncio
async def test_from_runs_deduplicates_run_ids_preserving_order() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    first = await _run_graph(graph, "first question")
    second = await _run_graph(graph, "second question")

    response = client.post(
        "/api/datasets/from-runs",
        json={"name": "Dupes", "run_ids": [second, first, second]},
    )

    body = response.json()
    assert body["source_run_ids"] == [second, first]
    assert [f["input"]["question"] for f in body["fixtures"]] == [
        "second question",
        "first question",
    ]


def test_from_runs_rejects_an_unknown_run() -> None:
    response = client.post("/api/datasets/from-runs", json={"name": "X", "run_ids": ["nope"]})
    assert response.status_code == 404
    assert "nope" in response.json()["detail"]


@pytest.mark.asyncio
async def test_from_runs_rejects_runs_from_different_graphs() -> None:
    graph_a = build_demo_graph()
    graph_b = build_demo_graph().model_copy(update={"id": "demo_second_graph"})
    storage.save_graph(graph_a)
    storage.save_graph(graph_b)
    run_a = await _run_graph(graph_a)
    run_b = await _run_graph(graph_b)

    response = client.post("/api/datasets/from-runs", json={"name": "X", "run_ids": [run_a, run_b]})

    assert response.status_code == 422
    assert "multiple graphs" in response.json()["detail"]


@pytest.mark.asyncio
async def test_from_runs_requires_succeeded_runs_only_when_freezing_outputs(monkeypatch) -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    run_id = await _run_graph(graph)
    real_get = runtime.get_run_summary

    def failed_summary(requested_id):
        summary = real_get(requested_id)
        return summary.model_copy(update={"status": "failed"}) if summary else None

    monkeypatch.setattr("app.datasets.runtime.get_run_summary", failed_summary)

    frozen = client.post("/api/datasets/from-runs", json={"name": "X", "run_ids": [run_id]})
    assert frozen.status_code == 422
    assert "failed" in frozen.json()["detail"]

    inputs_only = client.post(
        "/api/datasets/from-runs",
        json={"name": "X", "run_ids": [run_id], "include_node_outputs": False},
    )
    assert inputs_only.status_code == 200


def test_from_runs_validates_the_request_shape() -> None:
    empty_runs = client.post("/api/datasets/from-runs", json={"name": "X", "run_ids": []})
    empty_name = client.post("/api/datasets/from-runs", json={"name": "", "run_ids": ["r"]})
    assert empty_runs.status_code == 422
    assert empty_name.status_code == 422


def test_from_runs_caps_the_number_of_runs() -> None:
    too_many = [f"run_{i}" for i in range(MAX_RUNS_PER_DATASET + 1)]
    response = client.post("/api/datasets/from-runs", json={"name": "X", "run_ids": too_many})
    assert response.status_code == 422
    assert str(MAX_RUNS_PER_DATASET) in response.json()["detail"]
