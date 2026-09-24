"""SDK 4/7 (STO-617): opt-in cursor pagination on list routes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app
from app.models import GraphDefinition, RunSummary
from app.pagination import NEXT_CURSOR_HEADER, encode_cursor

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(tmp_path, monkeypatch):
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "paging.db"))
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def _graph(graph_id: str) -> GraphDefinition:
    return GraphDefinition(id=graph_id, name=graph_id, entry_node_id="n", nodes=[], edges=[])


def _walk(path: str, limit: int) -> tuple[list[dict], int]:
    """Follow X-Next-Cursor to the end; returns (items, pages)."""
    items: list[dict] = []
    cursor: str | None = None
    pages = 0
    while True:
        params: dict[str, str | int] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        response = client.get(path, params=params)
        assert response.status_code == 200, response.text
        pages += 1
        items.extend(response.json())
        cursor = response.headers.get(NEXT_CURSOR_HEADER)
        if not cursor:
            return items, pages


def test_graphs_page_through_130_items_by_id_with_no_gaps_or_repeats():
    ids = [f"g{i:03d}" for i in range(130)]
    for graph_id in reversed(ids):
        storage.save_graph(_graph(graph_id))

    items, pages = _walk("/api/graphs", 50)
    assert [item["id"] for item in items] == ids
    assert pages == 3

    unpaged = client.get("/api/graphs")
    assert NEXT_CURSOR_HEADER not in unpaged.headers
    assert len(unpaged.json()) == 130


def test_runs_page_past_the_unpaged_cap_newest_first():
    storage.save_graph(_graph("g"))
    for i in range(120):
        summary = RunSummary(
            run_id=f"run_{i:03d}",
            graph_id="g",
            status="succeeded",
            started_at=f"2026-01-01T00:{i // 60:02d}:{i % 60:02d}Z",
        )
        storage.save_run_snapshot(summary, [])

    assert len(client.get("/api/graphs/g/runs").json()) == 50  # unchanged default

    items, _ = _walk("/api/graphs/g/runs", 40)
    assert [item["run_id"] for item in items] == [f"run_{i:03d}" for i in reversed(range(120))]
    all_runs, _ = _walk("/api/runs", 100)
    assert len(all_runs) == 120


def test_resources_page_and_a_deleted_item_never_shifts_the_next_page():
    for i in range(105):
        storage.save_resource("prompts", f"p{i:03d}", {"id": f"p{i:03d}", "name": "x", "body": "y"})

    first = client.get("/api/prompts", params={"limit": 50})
    assert [item["id"] for item in first.json()][-1] == "p049"
    storage.delete_resource("prompts", "p049")  # the cursor's own item
    second = client.get(
        "/api/prompts", params={"limit": 50, "cursor": first.headers[NEXT_CURSOR_HEADER]}
    )
    assert second.json()[0]["id"] == "p050"


def test_the_last_page_has_no_cursor_and_bad_input_is_rejected():
    storage.save_graph(_graph("only"))
    response = client.get("/api/graphs", params={"limit": 1})
    assert [item["id"] for item in response.json()] == ["only"]
    assert NEXT_CURSOR_HEADER not in response.headers

    assert client.get("/api/graphs", params={"cursor": "%%%"}).status_code == 400
    assert client.get("/api/graphs", params={"limit": 0}).status_code == 422
    assert client.get("/api/graphs", params={"limit": 501}).status_code == 422
    # A cursor past the end is an empty page, not an error.
    past = client.get("/api/graphs", params={"limit": 5, "cursor": encode_cursor(("zzz",))})
    assert past.json() == []


def test_next_cursor_header_is_exposed_to_browsers():
    response = client.get(
        "/api/graphs",
        params={"limit": 1},
        headers={"Origin": "http://localhost:3000"},
    )
    exposed = response.headers.get("access-control-expose-headers", "")
    assert NEXT_CURSOR_HEADER.lower() in exposed.lower()


@pytest.mark.parametrize(
    "path",
    [
        "/api/graphs/g/releases",
        "/api/graphs/g/policy-exceptions",
        "/api/policy-exceptions",
        "/api/graphs/g/knowledge/lineage",
        "/api/prompts/p/versions",
        "/api/datasets",
    ],
)
def test_every_other_list_route_accepts_limit_and_cursor(path):
    storage.save_graph(_graph("g"))
    response = client.get(path, params={"limit": 10, "cursor": encode_cursor(("",))})
    assert response.status_code == 200, response.text
    assert response.json() == []
