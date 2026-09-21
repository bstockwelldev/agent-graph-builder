"""P1 rollout plan, Slice D: routing policy lab. Exit gate — running the
same graph against a fixture dataset twice, with one router edge condition
changed, produces a route-distribution comparison between the two runs."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.demo_graph import build_demo_graph
from app.main import app
from app.models import Fixture
from app.routing_lab import RoutingLabBlocked, compare_routing_reports, run_routing_dataset

client = TestClient(app)

_TECHNICAL_QUESTIONS = [
    "how does a database index work",
    "what is kubernetes",
    "explain docker containers",
]
_OTHER_QUESTIONS = ["what's your favorite color", "tell me a joke", "how are you today"]


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _dataset(questions: list[str]) -> list[Fixture]:
    return [Fixture(input={"question": q}) for q in questions]


@pytest.mark.asyncio
async def test_run_routing_dataset_aggregates_distribution_across_fixtures() -> None:
    graph = build_demo_graph()
    dataset = _dataset(_TECHNICAL_QUESTIONS + _OTHER_QUESTIONS)

    report = await run_routing_dataset(graph, dataset)

    assert report.dataset_size == 6
    assert len(report.runs) == 6
    assert all(r.status == "succeeded" for r in report.runs)

    router_distribution = next(d for d in report.distributions if d.node_id == "router_1")
    assert router_distribution.total == 6
    targets = {t.target_node_id: t.count for t in router_distribution.targets}
    assert targets.get("tool_lookup") == 3
    assert targets.get("prompt_answer") == 3


@pytest.mark.asyncio
async def test_compare_routing_reports_shows_distribution_shift_from_a_changed_edge_condition() -> (
    None
):
    """The exit gate: two graph variants differing only in the router's
    conditional edge condition, run against the identical dataset, produce
    a route-distribution comparison showing the shift."""
    graph = build_demo_graph()
    router_edge = next(e for e in graph.edges if e.source == "router_1" and e.condition)
    assert router_edge.condition == "technical"
    # router_1's condition matches against llm_classify's raw classification
    # word ("technical"/"other" — see providers/stub.py), not the question
    # text itself. Changing it to a value the classifier never produces is
    # the sharpest possible "router threshold changed" case: every fixture
    # that used to match now falls through to the default (prompt_answer)
    # branch instead.
    changed = graph.model_copy(
        update={
            "edges": [
                e.model_copy(update={"condition": "urgent"}) if e.id == router_edge.id else e
                for e in graph.edges
            ]
        }
    )
    dataset = _dataset(_TECHNICAL_QUESTIONS)

    baseline = await run_routing_dataset(graph, dataset)
    candidate = await run_routing_dataset(changed, dataset)
    comparison = compare_routing_reports(baseline, candidate)

    router_delta = next(d for d in comparison.distribution_deltas if d.node_id == "router_1")
    tool_lookup_delta = next(t for t in router_delta.targets if t.target_node_id == "tool_lookup")
    prompt_answer_delta = next(
        t for t in router_delta.targets if t.target_node_id == "prompt_answer"
    )
    # Baseline: all 3 technical questions match "technical" and route to
    # tool_lookup. Candidate: nothing matches "urgent", so all 3 fall
    # through to the default prompt_answer branch instead.
    assert tool_lookup_delta.baseline_count == 3
    assert tool_lookup_delta.candidate_count == 0
    assert prompt_answer_delta.baseline_count == 0
    assert prompt_answer_delta.candidate_count == 3


@pytest.mark.asyncio
async def test_run_routing_dataset_never_calls_a_fixture_stubbed_node_s_live_executor(
    monkeypatch,
) -> None:
    """Batched version of Slice B's own proof: a node stubbed across every
    fixture in the dataset never invokes its live executor, for any of the
    N runs. Routing-lab dataset runs go through `simulate_graph` exactly as
    a single simulate call would — LLM calls are always forced to the stub
    provider (never live), and a tool node's live executor is only skipped
    when a fixture stubs it, same guarantee as Slice B, just batched."""
    from app import nodes

    calls: list[str] = []
    monkeypatch.setattr(nodes, "lookup_topic", lambda topic: calls.append(topic) or "x")

    graph = build_demo_graph()
    dataset = [
        Fixture(input={"question": q}, node_outputs={"tool_lookup": "stubbed"})
        for q in _TECHNICAL_QUESTIONS
    ]
    report = await run_routing_dataset(graph, dataset)

    assert calls == []
    assert all(r.status == "succeeded" for r in report.runs)


@pytest.mark.asyncio
async def test_run_routing_dataset_raises_on_an_unstubbable_fixture() -> None:
    graph = build_demo_graph()
    bad_dataset = [Fixture(input={"question": "x"}, node_outputs={"router_1": {}})]
    with pytest.raises(RoutingLabBlocked):
        await run_routing_dataset(graph, bad_dataset)


def test_run_routing_dataset_endpoint_round_trip() -> None:
    from app import storage

    graph = build_demo_graph()
    storage.save_graph(graph)

    response = client.post(
        f"/api/graphs/{graph.id}/routing-lab/run",
        json={
            "dataset": [
                {"input": {"question": q}, "node_outputs": {}} for q in _TECHNICAL_QUESTIONS
            ]
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dataset_size"] == 3
    assert len(body["distributions"]) >= 1


def test_run_routing_dataset_endpoint_404_for_unknown_graph() -> None:
    response = client.post("/api/graphs/does_not_exist/routing-lab/run", json={"dataset": []})
    assert response.status_code == 404


def test_compare_routing_datasets_endpoint_round_trip() -> None:
    from app import storage

    graph = build_demo_graph()
    storage.save_graph(graph)
    other = graph.model_copy(update={"id": "demo_variant"})
    storage.save_graph(other)

    response = client.post(
        f"/api/graphs/{graph.id}/routing-lab/compare/{other.id}",
        json={
            "dataset": [
                {"input": {"question": q}, "node_outputs": {}} for q in _TECHNICAL_QUESTIONS
            ]
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["baseline"]["graph_id"] == graph.id
    assert body["candidate"]["graph_id"] == other.id


def test_compare_routing_datasets_endpoint_404_for_unknown_graph() -> None:
    from app import storage

    graph = build_demo_graph()
    storage.save_graph(graph)
    response = client.post(
        f"/api/graphs/{graph.id}/routing-lab/compare/does_not_exist", json={"dataset": []}
    )
    assert response.status_code == 404
