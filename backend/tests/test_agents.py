"""Slice 6 (resource-forms-consistency-plan): agent profiles run their graph
with an LLM profile, instructions and a tool allow-list applied."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.agents import normalize_agent_payload
from app.main import app
from tests.helpers import editable_demo_graph

QUESTION = {"question": "How does a database index work?"}


@pytest.fixture
def live(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("PUBLIC_DEMO_MODE", raising=False)
    with TestClient(app) as client:
        graph = editable_demo_graph()
        assert (
            client.put(f"/api/graphs/{graph.id}", json=graph.model_dump(mode="json")).status_code
            == 200
        )
        yield client


def _create(client: TestClient, kind: str, payload: dict) -> None:
    response = client.post(f"/api/{kind}", json=payload)
    assert response.status_code == 200, response.text


def _settled(client: TestClient, run_id: str) -> dict:
    for _ in range(200):
        summary = client.get(f"/api/runs/{run_id}").json()
        if summary["status"] in {"succeeded", "failed", "paused"}:
            return summary
        time.sleep(0.02)
    raise AssertionError(f"run {run_id} did not settle")


def _agent(**extra) -> dict:
    return {"id": "support", "name": "Support agent", "graph_id": "demo_copy", **extra}


def test_agent_run_applies_profile_instructions_and_records_the_agent(live: TestClient) -> None:
    _create(
        live,
        "llm-profiles",
        {"id": "fast", "name": "Fast", "model": "stub-small", "model_provider": "stub"},
    )
    _create(live, "prompts", {"id": "tone", "name": "Tone", "body": "Be brief."})
    _create(
        live,
        "agents",
        _agent(llm_profile_id="fast", system_prompt_id="tone", system_instructions="Cite sources."),
    )

    started = live.post("/api/agents/support/runs", json={"input": QUESTION})
    assert started.status_code == 200, started.text
    summary = _settled(live, started.json()["run_id"])
    assert summary["status"] == "succeeded"
    assert summary["agent_id"] == "support"
    assert summary["provider"] == "stub"
    # Persisted too, so run history shows which agent ran.
    listed = {run["run_id"]: run for run in live.get("/api/graphs/demo_copy/runs").json()}
    assert listed[summary["run_id"]]["agent_id"] == "support"

    traces = {t["node_id"]: t for t in live.get(f"/api/runs/{summary['run_id']}/nodes").json()}
    # Agent instructions come first, then the node's own system prompt.
    system_prompt = traces["llm_classify"]["input"]["systemPrompt"]
    assert system_prompt.startswith("Be brief.\n\nCite sources.")
    # The stored graph is untouched; the run's snapshot records what ran.
    stored = storage.get_graph("demo_copy")
    assert all("Be brief." not in str(n.config.get("systemPrompt", "")) for n in stored.nodes)
    snapshot = live.get(f"/api/runs/{summary['run_id']}/snapshot").json()
    snapshot_nodes = {n["id"]: n for n in snapshot["graph"]["nodes"]}
    assert snapshot_nodes["llm_classify"]["config"]["systemPrompt"].startswith("Be brief.")


def test_tool_allow_list_blocks_graphs_that_call_other_tools(live: TestClient) -> None:
    _create(live, "agents", _agent(tool_ids=["web_search"]))
    blocked = live.post("/api/agents/support/runs", json={"input": QUESTION})
    assert blocked.status_code == 422
    diagnostics = blocked.json()["detail"]["diagnostics"]
    assert [(d["code"], d["node_id"]) for d in diagnostics] == [
        ("AGENT_TOOL_NOT_ALLOWED", "tool_lookup")
    ]

    _create(live, "agents", {**_agent(tool_ids=["lookup_topic"]), "id": "allowed"})
    assert live.post("/api/agents/allowed/runs", json={"input": QUESTION}).status_code == 200


def test_explicit_provider_and_model_override_the_agents_profile(live: TestClient) -> None:
    _create(
        live,
        "llm-profiles",
        {"id": "groqish", "name": "Groq", "model": "big", "model_provider": "groq"},
    )
    _create(live, "agents", _agent(llm_profile_id="groqish"))
    started = live.post(
        "/api/agents/support/runs", json={"input": QUESTION, "provider": "stub", "model": "tiny"}
    )
    assert started.status_code == 200, started.text
    assert _settled(live, started.json()["run_id"])["provider"] == "stub"


def test_missing_agent_graph_or_resources_are_reported(live: TestClient) -> None:
    assert live.post("/api/agents/nope/runs", json={}).status_code == 404
    _create(live, "agents", {**_agent(), "id": "orphan", "graph_id": "gone"})
    assert live.post("/api/agents/orphan/runs", json={}).status_code == 422
    _create(live, "agents", {**_agent(llm_profile_id="missing"), "id": "noprofile"})
    response = live.post("/api/agents/noprofile/runs", json={})
    assert response.status_code == 422
    assert "LLM profile 'missing' not found" in response.text


def test_agents_stored_in_the_old_shape_read_in_the_new_one(live: TestClient) -> None:
    storage.save_resource(
        "agents",
        "legacy",
        {
            "id": "legacy",
            "name": "Legacy",
            "default_flow_id": "demo_copy",
            "optional_elements": ["x"],
        },
    )
    listed = {a["id"]: a for a in live.get("/api/agents").json()}
    assert listed["legacy"]["graph_id"] == "demo_copy"
    assert "optional_elements" not in listed["legacy"]
    assert live.get("/api/agents/legacy").json()["tool_ids"] == []
    assert live.post("/api/agents/legacy/runs", json={"input": QUESTION}).status_code == 200
    assert normalize_agent_payload({"id": "x", "name": "x"})["graph_id"] == ""
