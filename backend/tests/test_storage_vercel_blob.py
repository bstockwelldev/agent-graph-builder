"""Vercel Blob REST backend selection and mocked persistence."""

from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi.testclient import TestClient

from app import storage, subgraphs, vercel_blob
from app.bindings import resource_usages
from app.demo_graph import build_demo_graph
from app.main import app
from app.models import GraphDefinition, GraphNode, NodeTrace, NodeType, RunSummary
from app.pagination import NEXT_CURSOR_HEADER

_TEST_TOKEN = "vercel_blob_rw_teststore_secrettoken"


class FakeBlob:
    """In-memory stand-in for Vercel Blob REST."""

    def __init__(self, page_size: int | None = None) -> None:
        self.objects: dict[str, bytes] = {}
        self.uploaded_at: dict[str, str] = {}
        self.page_size = page_size
        self.put_headers: list[dict[str, str]] = []
        self.blob_reads: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        parsed = urlparse(str(request.url))
        params = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
        host = parsed.netloc
        if request.method == "PUT" and host == "vercel.com":
            pathname = params.get("pathname", "")
            self.put_headers.append({k: v for k, v in request.headers.items()})
            self.objects[pathname] = request.content
            # Monotonic upload time so newest-first listing is deterministic.
            self.uploaded_at[pathname] = f"2026-01-01T00:00:00.{len(self.put_headers):06d}Z"
            return httpx.Response(
                200,
                json={
                    "pathname": pathname,
                    "url": f"https://teststore.private.blob.vercel-storage.com/{pathname}",
                    "downloadUrl": f"https://teststore.private.blob.vercel-storage.com/{pathname}?download=1",
                },
            )
        if request.method == "GET" and host == "vercel.com":
            prefix = params.get("prefix", "")
            keys = sorted(key for key in self.objects if key.startswith(prefix))
            start = 0
            cursor = params.get("cursor")
            if cursor:
                start = int(cursor)
            size = self.page_size if self.page_size is not None else max(len(keys), 1)
            chunk = keys[start : start + size]
            next_index = start + len(chunk)
            has_more = next_index < len(keys)
            payload: dict = {
                "blobs": [
                    {
                        "pathname": key,
                        "url": f"https://teststore.private.blob.vercel-storage.com/{key}",
                        "downloadUrl": f"https://teststore.private.blob.vercel-storage.com/{key}?download=1",
                        "size": len(self.objects[key]),
                        "uploadedAt": self.uploaded_at[key],
                        "etag": "etag",
                    }
                    for key in chunk
                ],
                "hasMore": has_more,
            }
            if has_more:
                payload["cursor"] = str(next_index)
            return httpx.Response(200, json=payload)
        if request.method == "DELETE" and host == "vercel.com":
            # Added for studio-consolidation Phase 3 (resource + graph
            # delete); real Blob delete is idempotent on a missing key.
            pathname = params.get("pathname", "")
            self.objects.pop(pathname, None)
            return httpx.Response(200, json={"pathname": pathname})
        if request.method == "GET" and host.endswith(".blob.vercel-storage.com"):
            pathname = parsed.path.lstrip("/")
            self.blob_reads.append(pathname)
            if pathname not in self.objects:
                return httpx.Response(404, json={"error": {"code": "not_found"}})
            return httpx.Response(
                200,
                content=self.objects[pathname],
                headers={"content-type": "application/json"},
            )
        return httpx.Response(500, text=f"unexpected {request.method} {request.url}")


def _enable_blob(monkeypatch) -> FakeBlob:
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", _TEST_TOKEN)
    fake = FakeBlob()

    def factory() -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(fake.handle))

    monkeypatch.setattr(vercel_blob, "_http_client", factory)
    return fake


def test_use_vercel_blob_requires_token(monkeypatch) -> None:
    monkeypatch.delenv("BLOB_READ_WRITE_TOKEN", raising=False)
    assert storage.use_vercel_blob() is False
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", _TEST_TOKEN)
    assert storage.use_vercel_blob() is True


def test_storage_backend_prefers_blob_over_object_store_and_turso(monkeypatch) -> None:
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://example.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "token")
    monkeypatch.setenv("OBJECT_STORE_BUCKET", "agent-graphs")
    monkeypatch.setenv("OBJECT_STORE_ACCESS_KEY_ID", "ak")
    monkeypatch.setenv("OBJECT_STORE_SECRET_ACCESS_KEY", "sk")
    assert storage.storage_backend() == "object_store"

    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", _TEST_TOKEN)
    assert storage.storage_backend() == "vercel_blob"


def test_vercel_blob_persists_graphs_and_lists_newest_first(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    older = build_demo_graph()
    older.updated_at = "2026-01-01T00:00:00+00:00"
    newer = older.model_copy(
        update={
            "id": "graph_newer",
            "name": "Newer graph",
            "updated_at": "2026-06-01T00:00:00+00:00",
        }
    )

    storage.save_graph(older)
    storage.save_graph(newer)
    loaded = storage.get_graph(newer.id)
    listed = storage.list_graphs()

    assert loaded is not None
    assert loaded.name == "Newer graph"
    assert [graph.id for graph in listed] == ["graph_newer", older.id]
    assert f"graphs/{newer.id}.json" in fake.objects
    put_headers = fake.put_headers[0]
    assert put_headers["x-add-random-suffix"] == "0"
    assert put_headers["x-allow-overwrite"] == "1"
    assert put_headers["x-vercel-blob-access"] == "private"


def test_vercel_blob_missing_graph_returns_none(monkeypatch) -> None:
    _enable_blob(monkeypatch)
    assert storage.get_graph("missing") is None


def test_vercel_blob_run_snapshot_roundtrip(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    graph = build_demo_graph()
    summary = RunSummary(
        run_id="run_abc",
        graph_id=graph.id,
        status="succeeded",
        input={"question": "stored"},
        provider="stub",
        result="done",
        started_at="2026-01-01T00:00:00+00:00",
        completed_at="2026-01-01T00:00:01+00:00",
    )
    traces = [
        NodeTrace(
            node_id="input_1",
            node_type=NodeType.INPUT,
            status="succeeded",
            started_at="2026-01-01T00:00:00+00:00",
            completed_at="2026-01-01T00:00:01+00:00",
        )
    ]

    storage.save_run_snapshot(summary, traces)
    loaded = storage.get_run("run_abc")
    stored_traces = storage.get_run_traces("run_abc")
    other_graph_runs = storage.list_runs_for_graph("other")
    listed = storage.list_runs_for_graph(graph.id)
    missing = storage.get_run("missing")
    missing_traces = storage.get_run_traces("missing")

    assert loaded is not None
    assert loaded.result == "done"
    assert loaded.input == {"question": "stored"}
    assert [trace.node_id for trace in stored_traces] == ["input_1"]
    assert other_graph_runs == []
    assert [item.run_id for item in listed] == ["run_abc"]
    assert missing is None
    assert missing_traces == []
    payload = json.loads(fake.objects["runs/run_abc.json"])
    assert payload["summary"]["run_id"] == "run_abc"


def test_vercel_blob_lists_paginated_prefix(monkeypatch) -> None:
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", _TEST_TOKEN)
    fake = FakeBlob(page_size=1)

    def factory() -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(fake.handle))

    monkeypatch.setattr(vercel_blob, "_http_client", factory)
    first = build_demo_graph()
    first.updated_at = "2026-01-01T00:00:00+00:00"
    second = first.model_copy(
        update={"id": "graph_two", "name": "Two", "updated_at": "2026-02-01T00:00:00+00:00"}
    )

    storage.save_graph(first)
    storage.save_graph(second)
    listed = storage.list_graphs()

    assert {graph.id for graph in listed} == {first.id, "graph_two"}


def test_vercel_blob_does_not_write_sqlite(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "graphs.db"
    monkeypatch.setenv("GRAPH_DB_PATH", str(db_path))
    _enable_blob(monkeypatch)
    storage.save_graph(build_demo_graph())
    assert not db_path.exists()


def test_store_id_from_token_and_env(monkeypatch) -> None:
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", _TEST_TOKEN)
    monkeypatch.delenv("BLOB_STORE_ID", raising=False)
    assert vercel_blob._store_id() == "teststore"

    monkeypatch.setenv("BLOB_STORE_ID", "store_explicitid")
    assert vercel_blob._store_id() == "explicitid"


def test_vercel_blob_delete_graph(monkeypatch) -> None:
    # studio-consolidation Phase 3.
    _enable_blob(monkeypatch)
    graph = build_demo_graph()

    storage.save_graph(graph)
    assert storage.delete_graph(graph.id) is True
    assert storage.get_graph(graph.id) is None
    assert storage.delete_graph(graph.id) is False


def test_vercel_blob_resource_crud(monkeypatch) -> None:
    # studio-consolidation Phase 3 generic resource store.
    _enable_blob(monkeypatch)

    assert storage.get_resource("prompts", "p1") is None
    storage.save_resource("prompts", "p1", {"id": "p1", "name": "Greeting", "body": "Hi"})
    storage.save_resource("prompts", "p2", {"id": "p2", "name": "Farewell", "body": "Bye"})

    assert storage.get_resource("prompts", "p1") == {"id": "p1", "name": "Greeting", "body": "Hi"}
    listed = storage.list_resources("prompts")
    assert [item["id"] for item in listed] == ["p1", "p2"]

    assert storage.delete_resource("prompts", "p1") is True
    assert storage.get_resource("prompts", "p1") is None
    assert storage.delete_resource("prompts", "p1") is False


def _run(run_id: str, graph_id: str, started_at: str) -> RunSummary:
    return RunSummary(
        run_id=run_id,
        graph_id=graph_id,
        status="succeeded",
        started_at=started_at,
        completed_at=started_at,
    )


def test_vercel_blob_list_runs_for_graph_reads_only_that_graphs_newest_runs(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    for index in range(5):
        storage.save_run_snapshot(
            _run(f"run_a{index}", "graph_a", f"2026-01-0{index + 1}T00:00:00Z"), []
        )
    for index in range(20):
        storage.save_run_snapshot(_run(f"run_b{index}", "graph_b", "2026-02-01T00:00:00Z"), [])
    fake.blob_reads.clear()

    listed = storage.list_runs_for_graph("graph_a", limit=2)

    assert [run.run_id for run in listed] == ["run_a4", "run_a3"]
    assert sorted(fake.blob_reads) == [
        "run_index/graph_a/run_a3.json",
        "run_index/graph_a/run_a4.json",
    ]


def test_vercel_blob_list_all_runs_reads_at_most_limit_blobs(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    for index in range(10):
        started = f"2026-01-{index + 1:02d}T00:00:00Z"
        storage.save_run_snapshot(_run(f"run_{index}", f"graph_{index % 3}", started), [])
    fake.blob_reads.clear()

    listed = storage.list_all_runs(limit=3)

    assert [run.run_id for run in listed] == ["run_9", "run_8", "run_7"]
    assert len(fake.blob_reads) == 3
    assert all(path.startswith("runs/") for path in fake.blob_reads)


def test_vercel_blob_backfill_indexes_legacy_runs(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    # Written through the backend directly, as before run_index existed.
    vercel_blob.save_run_snapshot(_run("run_legacy", "graph_a", "2026-01-01T00:00:00Z"), [])
    storage.save_run_snapshot(_run("run_new", "graph_a", "2026-01-02T00:00:00Z"), [])
    assert [run.run_id for run in storage.list_runs_for_graph("graph_a")] == ["run_new"]

    assert storage.backfill_run_index() == 1
    assert storage.backfill_run_index() == 0
    assert "run_index/graph_a/run_legacy.json" in fake.objects
    listed = storage.list_runs_for_graph("graph_a")
    assert [run.run_id for run in listed] == ["run_new", "run_legacy"]
    assert storage.get_run("run_legacy") is not None


def test_vercel_blob_run_listing_limit_none_returns_every_run(monkeypatch) -> None:
    # Paged routes (SDK 4/7) pass limit=None and paginate in memory.
    _enable_blob(monkeypatch)
    for index in range(4):
        storage.save_run_snapshot(
            _run(f"run_{index}", "graph_a", f"2026-01-0{index + 1}T00:00:00Z"), []
        )

    assert len(storage.list_runs_for_graph("graph_a", limit=None)) == 4
    assert len(storage.list_all_runs(limit=None)) == 4


def _catalog_graph(graph_id: str, *, prompt_id: str = "", child_id: str = "") -> GraphDefinition:
    nodes = []
    if prompt_id:
        nodes.append(GraphNode(id="p", type=NodeType.PROMPT, config={"promptId": prompt_id}))
    if child_id:
        nodes.append(GraphNode(id="s", type=NodeType.SUBGRAPH, config={"graphId": child_id}))
    return GraphDefinition(
        id=graph_id,
        name=f"Graph {graph_id}",
        entry_node_id="p",
        nodes=nodes,
        edges=[],
        updated_at=f"2026-01-01T00:00:0{len(graph_id)}Z",
    )


def test_vercel_blob_graph_catalog_readers_cost_one_read(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    storage.save_graph(_catalog_graph("child"))
    storage.save_graph(_catalog_graph("parent", prompt_id="p1", child_id="child"))
    for index in range(10):
        storage.save_graph(_catalog_graph(f"other_{index}"))
    fake.blob_reads.clear()

    parents = subgraphs.used_by("child")
    usages = resource_usages(storage.list_graph_catalog(), "prompts", "p1")
    names = {entry.id: entry.name for entry in storage.list_graph_catalog()}

    assert parents == [{"graph_id": "parent", "name": "Graph parent", "node_ids": ["s"]}]
    assert usages == [
        {
            "graph_id": "parent",
            "graph_name": "Graph parent",
            "node_id": "p",
            "node_type": "prompt",
            "field": "promptId",
            "via": None,
        }
    ]
    assert len(names) == 12
    assert fake.blob_reads == ["graph_catalog.json"] * 3


def test_vercel_blob_graph_catalog_tracks_delete_and_rebuilds_when_missing(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    # Written through the backend directly, as before the catalog existed.
    vercel_blob.save_graph(_catalog_graph("legacy"))
    storage.save_graph(_catalog_graph("new"))  # scans the missing catalog once
    assert {entry.id for entry in storage.list_graph_catalog()} == {"legacy", "new"}

    assert storage.delete_graph("new") is True
    assert [entry.id for entry in storage.list_graph_catalog()] == ["legacy"]

    del fake.objects["graph_catalog.json"]
    fake.blob_reads.clear()
    assert [entry.id for entry in storage.list_graph_catalog()] == ["legacy"]
    assert "graph_catalog.json" in fake.objects
    fake.blob_reads.clear()
    storage.list_graph_catalog()
    assert fake.blob_reads == ["graph_catalog.json"]


def test_vercel_blob_paged_graph_listing_reads_only_the_page(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    for graph_id in ["g_c", "g_a", "g_e", "g_b", "g_d"]:
        storage.save_graph(_catalog_graph(graph_id))
    fake.blob_reads.clear()

    first = TestClient(app).get("/api/graphs", params={"limit": 2})
    cursor = first.headers[NEXT_CURSOR_HEADER]
    second = TestClient(app).get("/api/graphs", params={"limit": 2, "cursor": cursor})

    assert [graph["id"] for graph in first.json()] == ["g_a", "g_b"]
    assert [graph["id"] for graph in second.json()] == ["g_c", "g_d"]
    assert sorted(fake.blob_reads) == [
        "graphs/g_a.json",
        "graphs/g_b.json",
        "graphs/g_c.json",
        "graphs/g_d.json",
    ]


def test_vercel_blob_graph_summaries_route_reads_only_the_catalog(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    child = _catalog_graph("child")
    child.nodes.append(GraphNode(id="in", type=NodeType.INPUT, config={"variableName": "topic"}))
    storage.save_graph(child)
    storage.save_graph(_catalog_graph("parent", prompt_id="p1", child_id="child"))
    fake.blob_reads.clear()

    response = TestClient(app).get("/api/graph-summaries")

    assert response.status_code == 200
    by_id = {item["id"]: item for item in response.json()}
    assert by_id["child"]["input_variables"] == ["topic"]
    assert by_id["child"]["node_count"] == 1
    assert by_id["parent"]["subgraph_ids"] == ["child"]
    assert by_id["parent"]["input_variables"] == ["question"]
    assert "nodes" not in by_id["parent"]
    assert fake.blob_reads == ["graph_catalog.json"]


def test_vercel_blob_older_catalog_version_is_rebuilt(monkeypatch) -> None:
    fake = _enable_blob(monkeypatch)
    storage.save_graph(_catalog_graph("g1", prompt_id="p1"))
    # A catalog written before node_count/input_variables existed.
    fake.objects["graph_catalog.json"] = json.dumps(
        {"graphs": {"g1": {"id": "g1", "name": "Graph g1"}}}
    ).encode()

    (summary,) = storage.list_graph_summaries()

    assert summary.node_count == 1
    assert json.loads(fake.objects["graph_catalog.json"])["version"] == 2


def _llm_run(run_id: str, graph_id: str, started_at: str) -> tuple[RunSummary, list[NodeTrace]]:
    trace = NodeTrace(
        node_id="llm_1",
        node_type=NodeType.LLM,
        status="succeeded",
        input={"provider": "openai", "model": "gpt-4o", "userPrompt": "x" * 400},
        output="y" * 80,
        started_at=started_at,
        completed_at=started_at,
    )
    return _run(run_id, graph_id, started_at), [trace]


def test_vercel_blob_analytics_reads_each_run_blob_once(monkeypatch) -> None:
    from app.analytics import get_analytics_dashboard
    from app.node_analytics import get_graph_analytics

    fake = _enable_blob(monkeypatch)
    storage.save_graph(_catalog_graph("graph_a"))
    for index in range(4):
        storage.save_run_snapshot(
            *_llm_run(f"run_{index}", "graph_a", f"2026-01-0{index + 1}T00:00:00Z")
        )
    fake.blob_reads.clear()

    dashboard = get_analytics_dashboard(run_limit=3)

    run_reads = [path for path in fake.blob_reads if path.startswith("runs/")]
    assert sorted(run_reads) == ["runs/run_1.json", "runs/run_2.json", "runs/run_3.json"]
    assert fake.blob_reads.count("graph_catalog.json") == 1
    assert len(fake.blob_reads) == 4
    assert dashboard.totals.invocations == 3
    # chars/4 heuristic: 400 prompt chars + 80 output chars per run.
    assert dashboard.totals.input_tokens == 300
    assert dashboard.totals.output_tokens == 60

    fake.blob_reads.clear()
    graph = get_graph_analytics("graph_a", run_window=2)

    assert sorted(fake.blob_reads) == ["runs/run_2.json", "runs/run_3.json"]
    assert graph.run_window == 2
    assert graph.totals.input_tokens == 200
