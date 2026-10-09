"""Scored evals (evals.py): scorers, suite runs on Stub, live guards, the
case cap, stored runs and compare."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import evals, storage
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import FixtureExpectation, RouteDecision, RunSummary
from app.releases import publish_release
from app.resource_models import EvalScorer

client = TestClient(app)

INDEX_ANSWER = "A database index is a data structure that speeds up row lookups at the cost of extra writes and storage."


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("PUBLIC_DEMO_MODE", raising=False)


def _run(routes: dict[str, str]) -> RunSummary:
    return RunSummary(
        run_id="r",
        graph_id="g",
        status="succeeded",
        route_decisions=[
            RouteDecision(node_id=node, selected_edge_id="e", selected_target_node_id=target)
            for node, target in routes.items()
        ],
    )


# --- scorers ---------------------------------------------------------------


def test_each_scorer_checks_its_own_expectation_and_skips_otherwise() -> None:
    nothing = FixtureExpectation()
    assert all(
        evals.SCORERS[kind](nothing, "x", None) is None
        for kind in ("exact", "contains", "regex", "json_field", "route")
    )

    assert evals.score_exact(FixtureExpectation(output=" hi "), "hi", None).passed
    assert not evals.score_exact(FixtureExpectation(output="hi"), "bye", None).passed
    assert evals.score_exact(FixtureExpectation(output={"a": 1}), '{"a": 1}', None).passed

    contains = evals.score_contains(FixtureExpectation(contains=["Index", "missing"]), INDEX_ANSWER, None)
    assert (contains.score, contains.passed, contains.detail) == (0.5, False, "missing: missing")

    assert evals.score_regex(FixtureExpectation(regex=r"^A database"), INDEX_ANSWER, None).passed
    assert "invalid pattern" in evals.score_regex(FixtureExpectation(regex="("), "x", None).detail

    fields = evals.score_json_field(
        FixtureExpectation(json_fields={"/label": "tech", "/items/0": 1, "/nope": 2}),
        '{"label": "tech", "items": [1]}',
        None,
    )
    assert fields.score == pytest.approx(2 / 3)
    assert fields.detail == "wrong or missing: /nope"

    route = evals.score_route(FixtureExpectation(route={"router_1": "tool_lookup"}), None, _run({"router_1": "prompt_answer"}))
    assert (route.score, route.detail) == (0.0, "router_1 went to prompt_answer, not tool_lookup")

    assert evals.score_rubric(nothing, "clean answer", None).score == 1.0
    rubric = evals.score_rubric(nothing, "TODO answer {name}", None)
    assert rubric.score == pytest.approx(1 / 3)


def test_case_score_is_the_weighted_mean_of_scorers_that_checked_something() -> None:
    scorers = [EvalScorer(kind="contains", weight=3), EvalScorer(kind="regex", weight=1), EvalScorer(kind="exact")]
    expected = FixtureExpectation(contains=["index"], regex="nomatch")
    scores, score, passed = evals.score_case(scorers, expected, INDEX_ANSWER, None, pass_threshold=0.7)
    assert [s.scorer for s in scores] == ["contains", "regex"]
    assert score == 0.75 and passed is True
    assert evals.score_case(scorers, None, INDEX_ANSWER, None, 1.0) == ([], None, None)


# --- suite runs --------------------------------------------------------------


def _seed(fixtures: list[dict], **suite) -> str:
    graph = build_demo_graph()
    storage.save_graph(graph)
    client.post("/api/datasets", json={"id": "ds_eval", "name": "Eval set", "fixtures": fixtures}).raise_for_status()
    body = {"id": "suite_1", "name": "Demo quality", "graph_id": graph.id, "dataset_id": "ds_eval", **suite}
    response = client.post("/api/eval-suites", json=body)
    assert response.status_code == 200, response.text
    return graph.id


TECHNICAL = {
    "input": {"question": "how does a database index work"},
    "expected": {"contains": ["database index"], "route": {"router_1": "tool_lookup"}},
}
JOKE = {
    "input": {"question": "tell me a joke"},
    # The stub answers with a template; this one is meant to fail.
    "expected": {"contains": ["punchline"], "route": {"router_1": "prompt_answer"}},
}


def test_a_suite_runs_on_stub_scores_every_case_and_is_stored() -> None:
    _seed([TECHNICAL, JOKE, {"input": {"question": "unscored"}}])

    response = client.post("/api/eval-suites/suite_1/runs", json={})
    assert response.status_code == 200, response.text
    run = response.json()
    assert run["provider"] == "stub" and run["partial"] is False
    first, second, third = run["cases"]
    assert (first["score"], first["passed"]) == (1.0, True)
    assert (second["score"], second["passed"]) == (0.5, False)
    assert {s["scorer"]: s["passed"] for s in second["scores"]} == {"contains": False, "route": True}
    assert (third["score"], third["passed"]) == (None, None)
    assert run["score"] == 0.75 and run["pass_rate"] == 0.5
    assert first["run_id"] and first["output"].startswith("A database index")

    assert client.get(f"/api/eval-runs/{run['id']}").json()["id"] == run["id"]
    listed = client.get("/api/eval-suites/suite_1/runs").json()
    assert [r["id"] for r in listed] == [run["id"]]


def test_a_suite_can_run_against_a_release() -> None:
    graph_id = _seed([TECHNICAL])
    release, _created = publish_release(storage.get_graph(graph_id))
    run = client.post("/api/eval-suites/suite_1/runs", json={"target": "latest"}).json()
    assert run["release_id"] == release.id
    assert run["cases"][0]["passed"] is True
    assert client.post("/api/eval-suites/suite_1/runs", json={"target": "rel_missing"}).status_code == 404


def test_compare_reports_per_case_score_changes() -> None:
    _seed([TECHNICAL, JOKE], scorers=[{"kind": "contains"}])
    baseline = client.post("/api/eval-suites/suite_1/runs", json={}).json()
    # Make the joke case pass: expect what the stub actually says.
    dataset = client.get("/api/datasets/ds_eval").json()
    dataset["fixtures"][1]["expected"] = {"contains": ["stub answer"]}
    client.put("/api/datasets/ds_eval", json=dataset).raise_for_status()
    candidate = client.post("/api/eval-suites/suite_1/runs", json={}).json()

    comparison = client.get(f"/api/eval-runs/{baseline['id']}/compare/{candidate['id']}").json()
    assert comparison["score_delta"] == 0.5
    assert comparison["pass_rate_delta"] == 0.5
    assert [(c["fixture_index"], c["delta"]) for c in comparison["cases"]] == [(0, 0.0), (1, 1.0)]
    assert client.get(f"/api/eval-runs/{baseline['id']}/compare/evr_nope").status_code == 404


async def test_the_case_cap_marks_a_run_partial(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.models import Fixture
    from app.resource_models import EvalSuite

    monkeypatch.setattr(evals, "MAX_CASES", 2)
    suite = EvalSuite(id="s", name="s", graph_id="g", dataset_id="d")
    run = await evals.run_eval_suite(suite, build_demo_graph(), [Fixture(input={"question": "x"})] * 3)
    assert len(run.cases) == 2 and run.partial is True


def test_live_provider_is_guarded() -> None:
    _seed([TECHNICAL])
    no_key = client.post("/api/eval-suites/suite_1/runs", json={"provider": "groq"})
    assert no_key.status_code == 400
    assert "needs an API key" in no_key.json()["detail"]


def test_public_demo_mode_blocks_live_runs_without_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    _seed([TECHNICAL])
    monkeypatch.setenv("PUBLIC_DEMO_MODE", "1")
    blocked = client.post("/api/eval-suites/suite_1/runs", json={"provider": "groq"})
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "live_provider_requires_api_key"


def test_errors_for_missing_suites_datasets_and_runs() -> None:
    assert client.post("/api/eval-suites/nope/runs", json={}).status_code == 404
    assert client.get("/api/eval-suites/nope/runs").status_code == 404
    assert client.get("/api/eval-runs/nope").status_code == 404
    graph = build_demo_graph()
    storage.save_graph(graph)
    client.post(
        "/api/eval-suites", json={"id": "orphan", "name": "x", "graph_id": graph.id, "dataset_id": "gone"}
    ).raise_for_status()
    assert client.post("/api/eval-suites/orphan/runs", json={}).status_code == 422
