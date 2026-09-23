"""STO-609: counterfactual replay (forced routes, model swaps), the
draft ↔ release diff, and routing lab against a release."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import nodes, replay, runtime, storage
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import ModelOverride, ReplayRequest
from app.releases import publish_release
from app.replay import ReplayBlocked, replay_run

client = TestClient(app)

_TECHNICAL = "how does a database index work"  # stub classifier routes this to tool_lookup


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)


async def _recorded_run(question: str = _TECHNICAL) -> str:
    graph = build_demo_graph()
    storage.save_graph(graph)
    compiled = runtime.compile_workflow(graph)
    run_id, _bus = await runtime.start_run_inline(
        compiled.compiled_workflow_id, {"question": question}, provider="stub"
    )
    assert runtime.get_run_summary(run_id).status == "succeeded"
    return run_id


def _visited(traces) -> set[str]:
    return {t.node_id for t in traces}


@pytest.mark.asyncio
async def test_empty_request_is_a_plain_replay() -> None:
    run_id = await _recorded_run()
    result = await replay_run(run_id, ReplayRequest())
    assert result.counterfactual is False
    assert result.changed_nodes == []
    assert set(result.node_modes.values()) <= {"frozen", "recomputed"}
    assert result.node_modes["llm_classify"] == "frozen"


@pytest.mark.asyncio
async def test_forced_route_takes_the_other_branch_and_recomputes_it(monkeypatch) -> None:
    run_id = await _recorded_run()
    original = _visited(runtime.get_run_node_traces(run_id))
    assert "tool_lookup" in original and "llm_answer" not in original

    calls: list[str] = []
    monkeypatch.setattr(nodes, "lookup_topic", lambda topic: calls.append(topic) or "live")

    result = await replay_run(run_id, ReplayRequest(forced_routes={"router_1": "prompt_answer"}))
    visited = _visited(result.traces)
    assert result.run.status == "succeeded"
    assert {"prompt_answer", "llm_answer"} <= visited and "tool_lookup" not in visited
    assert result.node_modes["router_1"] == "forced"
    assert result.node_modes["llm_classify"] == "frozen"  # upstream of the change
    assert result.node_modes["llm_answer"] == "recomputed"
    assert result.run.provider == "stub"
    assert {"tool_lookup", "llm_answer", "output_1"} <= set(result.changed_nodes)
    assert calls == []  # the untaken tool branch never ran live
    decision = result.run.route_decisions[0]
    assert decision.selected_target_node_id == "prompt_answer"


@pytest.mark.asyncio
async def test_recomputed_tool_still_sees_run_input_variables() -> None:
    run_id = await _recorded_run("what's your favorite color")  # routes to prompt_answer
    result = await replay_run(run_id, ReplayRequest(forced_routes={"router_1": "tool_lookup"}))
    tool = next(t for t in result.traces if t.node_id == "tool_lookup")
    assert tool.input["topic"] == "what's your favorite color"
    assert result.node_modes["input_1"] == "recomputed"


@pytest.mark.asyncio
async def test_frozen_upstream_outputs_are_byte_identical() -> None:
    run_id = await _recorded_run()
    before = {t.node_id: t.output for t in runtime.get_run_node_traces(run_id)}
    result = await replay_run(run_id, ReplayRequest(forced_routes={"router_1": "prompt_answer"}))
    after = {t.node_id: t.output for t in result.traces}
    for node_id in ("prompt_classify", "llm_classify"):
        assert after[node_id] == before[node_id]


@pytest.mark.asyncio
async def test_model_swap_without_a_key_falls_back_to_stub() -> None:
    run_id = await _recorded_run()
    result = await replay_run(
        run_id,
        ReplayRequest(
            model_overrides={
                "llm_classify": ModelOverride(provider="groq", model="llama-3.1-8b-instant")
            }
        ),
    )
    assert result.node_modes["llm_classify"] == "stub_fallback"
    # Everything downstream of the swapped node recomputes.
    assert result.node_modes["router_1"] == "recomputed"
    assert result.node_modes["output_1"] == "recomputed"
    assert result.node_modes["prompt_classify"] == "frozen"


@pytest.mark.asyncio
async def test_model_swap_with_a_key_uses_that_provider(monkeypatch) -> None:
    run_id = await _recorded_run()
    built: list[tuple[str | None, str | None]] = []
    real = replay.get_chat_model

    def fake_get_chat_model(model=None, provider=None, **kwargs):
        built.append((model, provider))
        return real(model, provider="stub")

    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr(replay, "get_chat_model", fake_get_chat_model)
    result = await replay_run(
        run_id,
        ReplayRequest(model_overrides={"llm_classify": ModelOverride(provider="groq", model="m1")}),
    )
    assert ("m1", "groq") in built
    assert result.node_modes["llm_classify"] == "live"


@pytest.mark.asyncio
async def test_live_affected_uses_the_original_provider_when_usable(monkeypatch) -> None:
    run_id = await _recorded_run()
    monkeypatch.setattr(replay, "_provider_usable", lambda provider: True)
    runtime.get_run_summary(run_id).provider = "ollama"  # pretend the original ran live
    captured: dict[str, object] = {}
    real_start = runtime.start_run_inline

    async def spy(*args, **kwargs):
        captured["provider"] = kwargs.get("provider")
        kwargs["provider"] = "stub"
        return await real_start(*args, **kwargs)

    monkeypatch.setattr(runtime, "start_run_inline", spy)
    await replay_run(
        run_id, ReplayRequest(forced_routes={"router_1": "prompt_answer"}, live_affected=True)
    )
    assert captured["provider"] == "ollama"
    await replay_run(run_id, ReplayRequest(forced_routes={"router_1": "prompt_answer"}))
    assert captured["provider"] == "stub"


@pytest.mark.parametrize(
    "request_body",
    [
        {"forced_routes": {"llm_classify": "output_1"}},
        {"forced_routes": {"router_1": "output_1"}},
        {"model_overrides": {"router_1": {"provider": "stub"}}},
        {"model_overrides": {"llm_classify": {"provider": "nope"}}},
    ],
)
def test_invalid_counterfactual_is_rejected(request_body) -> None:
    import asyncio

    run_id = asyncio.run(_recorded_run())
    with pytest.raises(ReplayBlocked):
        asyncio.run(replay_run(run_id, ReplayRequest.model_validate(request_body)))
    response = client.post(f"/api/runs/{run_id}/replay", json=request_body)
    assert response.status_code == 422
    assert response.json()["detail"]["diagnostics"][0]["code"] == "REPLAY_COUNTERFACTUAL_INVALID"


def test_replay_route_accepts_no_body_and_a_counterfactual_body() -> None:
    import asyncio

    run_id = asyncio.run(_recorded_run())
    plain = client.post(f"/api/runs/{run_id}/replay")
    assert plain.status_code == 200, plain.text
    assert plain.json()["counterfactual"] is False
    forced = client.post(
        f"/api/runs/{run_id}/replay", json={"forced_routes": {"router_1": "prompt_answer"}}
    )
    assert forced.status_code == 200, forced.text
    body = forced.json()
    assert body["counterfactual"] is True and body["node_modes"]["router_1"] == "forced"
    assert body["original_run_id"] == run_id and body["original_traces"]


# ---------------------------------------------------------------- draft diff


def test_compare_draft_to_release_reports_unsaved_edits() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    release, _ = publish_release(graph, release_notes="n", author="a")

    same = client.post(
        f"/api/graph-releases/{release.id}/compare-draft", json=graph.model_dump(mode="json")
    )
    assert same.status_code == 200, same.text
    assert same.json()["identical"] is True
    assert same.json()["to_release_id"] is None and same.json()["to_label"] == "Draft"

    edited = build_demo_graph()
    next(n for n in edited.nodes if n.id == "llm_answer").config["model"] = "different-model"
    diff = client.post(
        f"/api/graph-releases/{release.id}/compare-draft", json=edited.model_dump(mode="json")
    ).json()
    assert diff["identical"] is False
    assert [c["id"] for c in diff["node_changes"]] == ["llm_answer"]


def test_compare_draft_to_release_errors() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    release, _ = publish_release(graph, release_notes="n", author="a")
    other = build_demo_graph()
    other.id = "someone_else"
    assert (
        client.post(
            f"/api/graph-releases/{release.id}/compare-draft", json=other.model_dump(mode="json")
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/graph-releases/rel_missing/compare-draft", json=graph.model_dump(mode="json")
        ).status_code
        == 404
    )


# ------------------------------------------------------- routing lab vs release


def test_routing_lab_compare_release_uses_release_as_baseline() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    publish_release(graph, release_notes="n", author="a")

    # Draft change: the technical branch now needs a word nothing contains.
    edited = build_demo_graph()
    next(e for e in edited.edges if e.condition == "technical").condition = "zzz-never"
    storage.save_graph(edited)

    dataset = [{"input": {"question": _TECHNICAL}}, {"input": {"question": "what is kubernetes"}}]
    response = client.post(
        f"/api/graphs/{graph.id}/routing-lab/compare-release/latest", json={"dataset": dataset}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert all(run["run_id"] for run in body["baseline"]["runs"])
    [delta] = body["distribution_deltas"]
    counts = {
        t["target_node_id"]: (t["baseline_count"], t["candidate_count"]) for t in delta["targets"]
    }
    assert counts["tool_lookup"][0] > counts["tool_lookup"][1]
    assert counts["prompt_answer"][1] == 2


def test_routing_lab_compare_release_404s() -> None:
    graph = build_demo_graph()
    storage.save_graph(graph)
    body = {"dataset": [{"input": {"question": "x"}}]}
    assert (
        client.post(
            f"/api/graphs/{graph.id}/routing-lab/compare-release/latest", json=body
        ).status_code
        == 404
    )
    assert (
        client.post("/api/graphs/missing/routing-lab/compare-release/latest", json=body).status_code
        == 404
    )
