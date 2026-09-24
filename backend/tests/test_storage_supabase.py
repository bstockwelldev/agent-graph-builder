"""Supabase Storage backend selection and mocked persistence
(studio-consolidation Phase 5 — see
docs/planning/features/studio-consolidation-plan.md). Mirrors
test_storage_vercel_blob.py's mocked-HTTP convention.
"""

from __future__ import annotations

import json
from urllib.parse import urlparse

import httpx

from app import storage, supabase_store
from app.demo_graph import build_demo_graph
from app.models import NodeTrace, NodeType, RunSummary

_TEST_URL = "https://project-ref.supabase.co"
_TEST_KEY = "service-role-secret"


class FakeSupabaseStorage:
    """In-memory stand-in for Supabase Storage REST."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.created_at: dict[str, str] = {}
        self.list_bodies: list[dict] = []
        self.object_reads: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        parsed = urlparse(str(request.url))
        path = parsed.path

        if request.method == "POST" and path.startswith("/storage/v1/object/list/"):
            body = json.loads(request.content or b"{}")
            self.list_bodies.append(body)
            prefix = body.get("prefix", "")
            keys = [key for key in self.objects if key.startswith(prefix)]
            sort_by = body.get("sortBy") or {"column": "name", "order": "asc"}
            if sort_by["column"] == "created_at":
                keys.sort(key=lambda key: self.created_at[key])
            else:
                keys.sort()
            if sort_by["order"] == "desc":
                keys.reverse()
            offset = body.get("offset", 0)
            page = keys[offset : offset + body.get("limit", 100)]
            return httpx.Response(
                200,
                json=[
                    {"name": key[len(prefix) :], "created_at": self.created_at[key]} for key in page
                ],
            )

        if request.method == "POST" and path.startswith("/storage/v1/object/"):
            key = path.removeprefix("/storage/v1/object/agent-graph-builder/")
            self.objects[key] = request.content
            # Monotonic creation time so newest-first listing is deterministic.
            self.created_at.setdefault(key, f"2026-01-01T00:00:00.{len(self.created_at):06d}Z")
            return httpx.Response(200, json={"Key": key})

        if request.method == "GET" and path.startswith("/storage/v1/object/"):
            key = path.removeprefix("/storage/v1/object/agent-graph-builder/")
            self.object_reads.append(key)
            if key not in self.objects:
                return httpx.Response(404, json={"error": "not_found"})
            return httpx.Response(200, content=self.objects[key])

        if request.method == "DELETE" and path.startswith("/storage/v1/object/"):
            key = path.removeprefix("/storage/v1/object/agent-graph-builder/")
            if key not in self.objects:
                return httpx.Response(404, json={"error": "not_found"})
            del self.objects[key]
            return httpx.Response(200, json={"message": "deleted"})

        return httpx.Response(404, json={"error": "unhandled"})


def _enable_supabase(monkeypatch) -> FakeSupabaseStorage:
    monkeypatch.setenv("SUPABASE_URL", _TEST_URL)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", _TEST_KEY)
    fake = FakeSupabaseStorage()

    def factory() -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(fake.handle))

    monkeypatch.setattr(supabase_store, "_http_client", factory)
    return fake


def test_use_supabase_requires_both_env_vars(monkeypatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert storage.use_supabase() is False
    monkeypatch.setenv("SUPABASE_URL", _TEST_URL)
    assert storage.use_supabase() is False
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", _TEST_KEY)
    assert storage.use_supabase() is True


def test_storage_backend_prefers_blob_over_supabase(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", _TEST_URL)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", _TEST_KEY)
    assert storage.storage_backend() == "supabase"

    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_teststore_token")
    assert storage.storage_backend() == "vercel_blob"


def test_storage_backend_supabase_beats_object_store_and_turso(monkeypatch) -> None:
    monkeypatch.delenv("BLOB_READ_WRITE_TOKEN", raising=False)
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://example.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "token")
    monkeypatch.setenv("OBJECT_STORE_BUCKET", "agent-graphs")
    monkeypatch.setenv("OBJECT_STORE_ACCESS_KEY_ID", "ak")
    monkeypatch.setenv("OBJECT_STORE_SECRET_ACCESS_KEY", "sk")
    assert storage.storage_backend() == "object_store"

    monkeypatch.setenv("SUPABASE_URL", _TEST_URL)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", _TEST_KEY)
    assert storage.storage_backend() == "supabase"


def test_supabase_persists_graphs_and_lists_newest_first(monkeypatch) -> None:
    _enable_supabase(monkeypatch)
    older = build_demo_graph().model_copy(
        update={"id": "g_older", "updated_at": "2026-01-01T00:00:00Z"}
    )
    newer = build_demo_graph().model_copy(
        update={"id": "g_newer", "updated_at": "2026-06-01T00:00:00Z"}
    )

    storage.save_graph(older)
    storage.save_graph(newer)

    graphs = storage.list_graphs()
    ids = [g.id for g in graphs]
    assert ids.index("g_newer") < ids.index("g_older")

    fetched = storage.get_graph("g_newer")
    assert fetched is not None
    assert fetched.id == "g_newer"


def test_supabase_missing_graph_returns_none(monkeypatch) -> None:
    _enable_supabase(monkeypatch)
    assert storage.get_graph("does-not-exist") is None


def test_supabase_run_snapshot_roundtrip(monkeypatch) -> None:
    _enable_supabase(monkeypatch)
    summary = RunSummary(
        run_id="run_supa_1",
        graph_id="g1",
        status="succeeded",
        result={"ok": True},
        started_at="2026-01-01T00:00:00Z",
        completed_at="2026-01-01T00:00:05Z",
    )
    traces = [
        NodeTrace(
            node_id="n1",
            node_type=NodeType.OUTPUT,
            status="succeeded",
            input=None,
            output="done",
            started_at="2026-01-01T00:00:01Z",
        )
    ]
    storage.save_run_snapshot(summary, traces)

    fetched = storage.get_run("run_supa_1")
    assert fetched is not None
    assert fetched.status == "succeeded"
    assert storage.get_run_traces("run_supa_1")[0].node_id == "n1"
    assert any(r.run_id == "run_supa_1" for r in storage.list_runs_for_graph("g1"))


def test_supabase_delete_graph(monkeypatch) -> None:
    _enable_supabase(monkeypatch)
    graph = build_demo_graph().model_copy(update={"id": "g_to_delete"})
    storage.save_graph(graph)
    assert storage.get_graph("g_to_delete") is not None

    assert storage.delete_graph("g_to_delete") is True
    assert storage.get_graph("g_to_delete") is None
    assert storage.delete_graph("g_to_delete") is False


def test_supabase_resource_crud(monkeypatch) -> None:
    _enable_supabase(monkeypatch)
    storage.save_resource("prompts", "p1", {"id": "p1", "name": "Greeting", "body": "Hi"})
    assert storage.get_resource("prompts", "p1") == {"id": "p1", "name": "Greeting", "body": "Hi"}
    assert any(item["id"] == "p1" for item in storage.list_resources("prompts"))
    assert storage.delete_resource("prompts", "p1") is True
    assert storage.get_resource("prompts", "p1") is None


def _run(run_id: str, graph_id: str, started_at: str) -> RunSummary:
    return RunSummary(
        run_id=run_id,
        graph_id=graph_id,
        status="succeeded",
        started_at=started_at,
        completed_at=started_at,
    )


def test_supabase_list_runs_for_graph_reads_only_that_graphs_newest_runs(monkeypatch) -> None:
    fake = _enable_supabase(monkeypatch)
    for index in range(5):
        started = f"2026-01-0{index + 1}T00:00:00Z"
        storage.save_run_snapshot(_run(f"run_a{index}", "g_a", started), [])
    for index in range(20):
        storage.save_run_snapshot(_run(f"run_b{index}", "g_b", "2026-02-01T00:00:00Z"), [])
    fake.object_reads.clear()
    fake.list_bodies.clear()

    listed = storage.list_runs_for_graph("g_a", limit=2)

    assert [run.run_id for run in listed] == ["run_a4", "run_a3"]
    assert sorted(fake.object_reads) == ["run_index/g_a/run_a3.json", "run_index/g_a/run_a4.json"]
    assert fake.list_bodies == [
        {
            "prefix": "run_index/g_a/",
            "limit": 1000,
            "offset": 0,
            "sortBy": {"column": "created_at", "order": "desc"},
        }
    ]


def test_supabase_list_all_runs_reads_at_most_limit_objects(monkeypatch) -> None:
    fake = _enable_supabase(monkeypatch)
    for index in range(10):
        started = f"2026-01-{index + 1:02d}T00:00:00Z"
        storage.save_run_snapshot(_run(f"run_{index}", f"g_{index % 3}", started), [])
    fake.object_reads.clear()

    listed = storage.list_all_runs(limit=3)

    assert [run.run_id for run in listed] == ["run_9", "run_8", "run_7"]
    assert len(fake.object_reads) == 3


def test_supabase_backfill_indexes_legacy_runs(monkeypatch) -> None:
    fake = _enable_supabase(monkeypatch)
    # Written through the backend directly, as before run_index existed.
    supabase_store.save_run_snapshot(_run("run_legacy", "g_a", "2026-01-01T00:00:00Z"), [])
    storage.save_run_snapshot(_run("run_new", "g_a", "2026-01-02T00:00:00Z"), [])

    assert storage.backfill_run_index() == 1
    assert storage.backfill_run_index() == 0
    assert "run_index/g_a/run_legacy.json" in fake.objects
    listed = storage.list_runs_for_graph("g_a")
    assert [run.run_id for run in listed] == ["run_new", "run_legacy"]


def test_secret_key_sent_on_apikey_header_only(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_testkey")
    assert supabase_store._headers() == {"apikey": "sb_secret_testkey"}


def test_legacy_jwt_key_keeps_bearer_header(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "eyJlegacy")
    assert supabase_store._headers() == {"Authorization": "Bearer eyJlegacy", "apikey": "eyJlegacy"}
