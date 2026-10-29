"""STO-626: workspace-scoped writes are locked on the anonymous public
deploy, and each visitor IP gets a budget for creating stored objects and
for runs (app/public_writes.py)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import public_writes, storage
from app.demo_graph import DEMO_GRAPH_ID
from app.main import _seed_demo_graph, app
from tests.helpers import editable_demo_graph

client = TestClient(app)

QUESTION = {"question": "How does a database index work?"}
BLOCK_MODEL_NODES = {
    "rules": {
        "POLICY_TOO_MANY_MODEL_NODES": {"enforcement": "block", "params": {"max_model_nodes": 1}}
    }
}


@pytest.fixture(autouse=True)
def _isolated(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("PUBLIC_DEMO_MODE", raising=False)
    for bucket in ("CREATE", "RUN"):
        for window in ("HOUR", "DAY"):
            monkeypatch.delenv(f"PUBLIC_{bucket}_LIMIT_PER_{window}", raising=False)
    public_writes.reset_local_quotas()
    _seed_demo_graph()


@pytest.fixture
def public_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PUBLIC_DEMO_MODE", "1")


def _new_graph(name: str = "Visitor graph", ip: str | None = None):
    headers = {"x-forwarded-for": ip} if ip else {}
    return client.post("/api/graphs", json={"name": name}, headers=headers)


def _run(graph_id: str):
    return client.post(
        "/api/runs", json={"graph_id": graph_id, "input": QUESTION, "provider": "stub"}
    )


# --- Workspace policies ---------------------------------------------------


def test_public_mode_rejects_workspace_policy_writes(public_mode) -> None:
    response = client.put("/api/policies/workspace", json=BLOCK_MODEL_NODES)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "workspace_read_only"


def test_public_mode_ignores_workspace_policies_stored_before_the_lock(monkeypatch) -> None:
    # Written while the deploy was still open (or by an operator locally)...
    assert client.put("/api/policies/workspace", json=BLOCK_MODEL_NODES).status_code == 200
    graph = editable_demo_graph()
    assert (
        client.put(f"/api/graphs/{graph.id}", json=graph.model_dump(mode="json")).status_code == 200
    )
    assert _run(graph.id).status_code == 422  # blocked: two llm nodes > 1

    # ...has no effect once the deploy is public.
    monkeypatch.setenv("PUBLIC_DEMO_MODE", "1")
    assert client.get("/api/policies/workspace").json()["rules"] == {}
    effective = {
        rule["rule"]["code"]: rule for rule in client.get("/api/policies/effective").json()
    }
    assert effective["POLICY_TOO_MANY_MODEL_NODES"]["enforcement"] == "warn"
    assert _run(graph.id).status_code == 200
    assert _run(DEMO_GRAPH_ID).status_code == 200


def test_graph_policies_stay_writable_for_visitor_graphs(public_mode) -> None:
    graph_id = _new_graph().json()["id"]
    response = client.put(f"/api/graphs/{graph_id}/policies", json=BLOCK_MODEL_NODES)
    assert response.status_code == 200, response.text


def test_private_mode_keeps_workspace_policies_writable() -> None:
    assert client.put("/api/policies/workspace", json=BLOCK_MODEL_NODES).status_code == 200
    assert client.get("/api/policies/workspace").json()["rules"]


# --- Per-IP write budget --------------------------------------------------


def test_create_budget_is_per_ip_and_returns_429(public_mode, monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_CREATE_LIMIT_PER_HOUR", "2")
    assert _new_graph(ip="203.0.113.7").status_code == 200
    assert _new_graph(ip="203.0.113.7").status_code == 200
    limited = _new_graph(ip="203.0.113.7")
    assert limited.status_code == 429
    assert limited.json()["detail"]["code"] == "write_rate_limited"
    assert 0 < int(limited.headers["retry-after"]) <= 3601
    # Another visitor still has their own budget.
    assert _new_graph(ip="198.51.100.4").status_code == 200


def test_every_kind_of_new_object_counts(public_mode, monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_CREATE_LIMIT_PER_HOUR", "3")
    copy = editable_demo_graph().model_dump(mode="json")
    assert client.put(f"/api/graphs/{copy['id']}", json=copy).status_code == 200  # PUT to a new id
    prompt = {"id": "p1", "name": "Visitor prompt", "body": "Hi {question}"}
    assert client.post("/api/prompts", json=prompt).status_code == 200
    assert client.post(f"/api/graphs/{copy['id']}/releases", json={}).status_code == 200
    assert client.post("/api/prompts", json={**prompt, "id": "p2"}).status_code == 429


def test_saving_existing_objects_never_counts(public_mode, monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_CREATE_LIMIT_PER_HOUR", "2")
    graph = _new_graph().json()
    prompt = {"id": "p1", "name": "Visitor prompt", "body": "Hi {question}"}
    assert client.post("/api/prompts", json=prompt).status_code == 200
    for n in range(5):
        assert (
            client.put(
                f"/api/graphs/{graph['id']}", json={**graph, "name": f"Rename {n}"}
            ).status_code
            == 200
        )
        assert (
            client.put("/api/prompts/p1", json={**prompt, "body": f"v{n} {{question}}"}).status_code
            == 200
        )
    # The seeded demo's layout-only saves don't count either.
    assert _new_graph().status_code == 429


def test_run_budget_is_separate(public_mode, monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_RUN_LIMIT_PER_HOUR", "1")
    monkeypatch.setenv("PUBLIC_CREATE_LIMIT_PER_HOUR", "5")
    assert _run(DEMO_GRAPH_ID).status_code == 200
    limited = _run(DEMO_GRAPH_ID)
    assert limited.status_code == 429
    assert "runs" in limited.json()["detail"]["message"]
    assert _new_graph().status_code == 200


def test_daily_budget(public_mode, monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_CREATE_LIMIT_PER_HOUR", "100")
    monkeypatch.setenv("PUBLIC_CREATE_LIMIT_PER_DAY", "1")
    assert _new_graph().status_code == 200
    limited = _new_graph()
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) > 3600


def test_private_mode_has_no_budget(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_CREATE_LIMIT_PER_HOUR", "1")
    for _ in range(3):
        assert _new_graph().status_code == 200


def test_shared_store_keeps_counts_across_instances_and_hashes_the_ip(
    public_mode, monkeypatch
) -> None:
    """On Supabase/object storage every serverless instance reads the same
    log, so a fresh instance (empty memory) still sees earlier writes."""
    shared: dict[str, dict] = {}
    monkeypatch.setattr(storage, "write_quotas_shared", lambda: True)
    monkeypatch.setattr(storage, "get_write_quota", lambda key: shared.get(key))
    monkeypatch.setattr(
        storage, "save_write_quota", lambda key, payload: shared.__setitem__(key, payload)
    )
    monkeypatch.setenv("PUBLIC_CREATE_LIMIT_PER_HOUR", "1")

    assert _new_graph(ip="203.0.113.9").status_code == 200
    public_writes.reset_local_quotas()  # a different instance
    assert _new_graph(ip="203.0.113.9").status_code == 429
    assert len(shared) == 1
    assert all("203.0.113.9" not in key for key in shared)


def test_vercel_headers_win_over_x_forwarded_for(public_mode, monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_CREATE_LIMIT_PER_HOUR", "1")
    spoof = {"x-vercel-forwarded-for": "203.0.113.20", "x-forwarded-for": "1.2.3.4"}
    assert client.post("/api/graphs", json={"name": "a"}, headers=spoof).status_code == 200
    # Rotating the spoofable header doesn't reset the budget.
    spoof["x-forwarded-for"] = "5.6.7.8"
    assert client.post("/api/graphs", json={"name": "b"}, headers=spoof).status_code == 429
