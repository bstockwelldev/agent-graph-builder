"""Wave 7a (STO-610): graph health score and node blast radius."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import runtime, storage
from app.compiler import validate_graph
from app.demo_graph import build_demo_graph
from app.graph_health import compute_graph_health
from app.impact import compute_node_impact
from app.main import app
from app.models import Diagnostic, GraphEdge, GraphNode, NodePosition, NodeType
from app.node_analytics import get_graph_analytics
from app.releases import publish_release

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _factor(health, factor_id):
    return next(f for f in health.factors if f.id == factor_id)


async def _run(graph, question="how does a database index work") -> str:
    compiled = runtime.compile_workflow(graph)
    run_id, _ = await runtime.start_run_inline(
        compiled.compiled_workflow_id, {"question": question}, provider="stub"
    )
    return run_id


# ------------------------------------------------------------------ health


def test_demo_graph_without_runs_is_healthy_and_skips_run_factors() -> None:
    graph = build_demo_graph()
    health = compute_graph_health(graph, validate_graph(graph), None)
    assert health.band == "healthy", health
    assert _factor(health, "untested").note == "No runs yet."
    assert _factor(health, "failures").deduction == 0


def test_unreachable_and_dead_end_nodes_deduct_with_caps() -> None:
    graph = build_demo_graph()
    for i in range(5):
        graph.nodes.append(
            GraphNode(
                id=f"orphan_{i}",
                type=NodeType.PROMPT,
                position=NodePosition(x=0, y=0),
                config={"template": "x"},
            )
        )
    health = compute_graph_health(graph, [], None)
    unreachable = _factor(health, "unreachable")
    dead_ends = _factor(health, "dead_ends")
    assert unreachable.deduction == 15 and len(unreachable.items) == 5  # capped at 15
    assert dead_ends.deduction == 10  # capped at 10
    assert unreachable.items[0].node_id == "orphan_0"
    assert health.score == 100 - 15 - 10


def test_blocking_errors_and_warnings_deduct() -> None:
    graph = build_demo_graph()
    diagnostics = [
        Diagnostic(severity="error", code="X", message="bad", blocking=True, node_id="llm_answer"),
        Diagnostic(severity="warning", code="Y", message="meh", blocking=False),
    ]
    health = compute_graph_health(graph, diagnostics, None)
    assert _factor(health, "blocking_errors").deduction == 25
    assert _factor(health, "blocking_errors").items[0].node_id == "llm_answer"
    assert _factor(health, "warnings").deduction == 3


def test_unreachable_warning_is_not_double_counted() -> None:
    graph = build_demo_graph()
    graph.nodes.append(
        GraphNode(id="orphan", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0))
    )
    health = compute_graph_health(graph, validate_graph(graph), None)
    assert not any(i.node_id == "orphan" for i in _factor(health, "warnings").items)
    assert [i.node_id for i in _factor(health, "unreachable").items] == ["orphan"]


def test_complexity_flags_fan_out() -> None:
    graph = build_demo_graph()
    for i in range(6):
        graph.nodes.append(
            GraphNode(id=f"leaf_{i}", type=NodeType.OUTPUT, position=NodePosition(x=0, y=0))
        )
        graph.edges.append(
            GraphEdge(id=f"e_leaf_{i}", source="prompt_classify", target=f"leaf_{i}")
        )
    health = compute_graph_health(graph, [], None)
    complexity = _factor(health, "complexity")
    assert complexity.deduction == 5 and complexity.items[0].node_id == "prompt_classify"


@pytest.mark.asyncio
async def test_run_history_drives_untested_and_failures() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    await _run(graph)  # technical question: prompt_answer / llm_answer never run
    health = compute_graph_health(graph, [], get_graph_analytics(graph.id))
    untested = _factor(health, "untested")
    assert {i.node_id for i in untested.items} == {"prompt_answer", "llm_answer"}
    assert untested.deduction == round(15 * 2 / len(graph.nodes))
    assert _factor(health, "failures").deduction == 0


def test_health_route_uses_the_draft_body() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    draft = build_demo_graph()
    draft.nodes.append(
        GraphNode(
            id="orphan",
            type=NodeType.PROMPT,
            position=NodePosition(x=0, y=0),
            config={"template": "x"},
        )
    )
    body = client.post(f"/api/graphs/{graph.id}/health", json=draft.model_dump(mode="json"))
    assert body.status_code == 200, body.text
    assert any(i["node_id"] == "orphan" for f in body.json()["factors"] for i in f["items"])
    other = build_demo_graph()
    other.id = "nope"
    assert (
        client.post(
            f"/api/graphs/{graph.id}/health", json=other.model_dump(mode="json")
        ).status_code
        == 422
    )
    assert (
        client.post("/api/graphs/missing/health", json=other.model_dump(mode="json")).status_code
        == 404
    )


# ------------------------------------------------------------------ impact


def test_impact_reports_downstream_outputs_and_routers() -> None:
    graph = build_demo_graph()
    impact = compute_node_impact(graph, "llm_classify")
    assert impact.downstream[0] == "router_1"
    assert set(impact.downstream) == {
        "router_1",
        "tool_lookup",
        "prompt_answer",
        "llm_answer",
        "output_1",
    }
    assert impact.outputs_reached == ["output_1"]
    assert impact.routers_downstream == ["router_1"]
    assert impact.upstream_count == 2
    assert impact.runs.executions == 0


def test_impact_reports_bindings() -> None:
    graph = build_demo_graph()
    node = next(n for n in graph.nodes if n.id == "prompt_answer")
    node.config["promptId"] = "p_answer"
    impact = compute_node_impact(graph, "prompt_answer")
    assert [(b.kind, b.resource_id) for b in impact.bindings] == [("prompts", "p_answer")]


@pytest.mark.asyncio
async def test_impact_reports_runs_releases_and_datasets() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    release, _ = publish_release(graph, release_notes="n", author="a")
    run_id = await _run(graph)
    storage.save_resource(
        "datasets",
        "ds_1",
        {
            "id": "ds_1",
            "name": "Stubbed",
            "fixtures": [{"input": {}, "node_outputs": {"llm_classify": "technical"}}],
        },
    )

    unchanged = compute_node_impact(graph, "llm_classify")
    assert unchanged.runs.executions == 1 and unchanged.runs.last_run_id == run_id
    assert [(r.release_id, r.changed_since) for r in unchanged.releases] == [(release.id, False)]
    assert [d.dataset_id for d in unchanged.datasets] == ["ds_1"]

    edited = build_demo_graph()
    next(n for n in edited.nodes if n.id == "llm_classify").config["model"] = "other"
    assert compute_node_impact(edited, "llm_classify").releases[0].changed_since is True
    assert compute_node_impact(edited, "llm_answer").releases[0].changed_since is False


def test_impact_route_404s_for_unknown_node() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    body = graph.model_dump(mode="json")
    ok = client.post(f"/api/graphs/{graph.id}/nodes/router_1/impact", json=body)
    assert ok.status_code == 200 and ok.json()["downstream"]
    assert client.post(f"/api/graphs/{graph.id}/nodes/nope/impact", json=body).status_code == 404
