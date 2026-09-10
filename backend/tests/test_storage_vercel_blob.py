"""Vercel Blob REST backend selection and mocked persistence."""

from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

import httpx

from app import storage, vercel_blob
from app.demo_graph import build_demo_graph
from app.models import NodeTrace, NodeType, RunSummary

_TEST_TOKEN = "vercel_blob_rw_teststore_secrettoken"


class FakeBlob:
    """In-memory stand-in for Vercel Blob REST."""

    def __init__(self, page_size: int | None = None) -> None:
        self.objects: dict[str, bytes] = {}
        self.page_size = page_size
        self.put_headers: list[dict[str, str]] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        parsed = urlparse(str(request.url))
        params = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
        host = parsed.netloc
        if request.method == "PUT" and host == "vercel.com":
            pathname = params.get("pathname", "")
            self.put_headers.append({k: v for k, v in request.headers.items()})
            self.objects[pathname] = request.content
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
                        "uploadedAt": "2026-01-01T00:00:00.000Z",
                        "etag": "etag",
                    }
                    for key in chunk
                ],
                "hasMore": has_more,
            }
            if has_more:
                payload["cursor"] = str(next_index)
            return httpx.Response(200, json=payload)
        if request.method == "GET" and host.endswith(".blob.vercel-storage.com"):
            pathname = parsed.path.lstrip("/")
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
