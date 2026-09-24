"""S3-compatible object-store backend selection and mocked persistence."""

from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from botocore.exceptions import ClientError

from app import object_store, storage
from app.demo_graph import build_demo_graph
from app.models import NodeTrace, NodeType, RunSummary


class FakeS3:
    """In-memory stand-in for boto3 S3 client."""

    def __init__(self, page_size: int | None = None) -> None:
        self.objects: dict[str, bytes] = {}
        self.last_modified: dict[str, datetime] = {}
        self.page_size = page_size

    def put_object(self, *, Bucket: str, Key: str, Body, ContentType: str | None = None) -> dict:
        del Bucket, ContentType
        self.objects[Key] = Body if isinstance(Body, bytes) else str(Body).encode("utf-8")
        # Monotonic write time so newest-first listing is deterministic.
        self.last_modified[Key] = datetime(2026, 1, 1, tzinfo=UTC) + timedelta(
            seconds=len(self.last_modified)
        )
        return {}

    def get_object(self, *, Bucket: str, Key: str) -> dict:
        del Bucket
        if Key not in self.objects:
            raise ClientError(
                {"Error": {"Code": "NoSuchKey", "Message": "Not Found"}},
                "GetObject",
            )
        return {"Body": io.BytesIO(self.objects[Key])}

    def delete_object(self, *, Bucket: str, Key: str) -> dict:
        # Added for studio-consolidation Phase 3 (resource + graph delete);
        # real S3 delete_object is idempotent (no error on a missing key).
        del Bucket
        self.objects.pop(Key, None)
        return {}

    def list_objects_v2(
        self,
        *,
        Bucket: str,
        Prefix: str = "",
        ContinuationToken: str | None = None,
        **kwargs,
    ) -> dict:
        del Bucket, kwargs
        keys = sorted(key for key in self.objects if key.startswith(Prefix))
        start = int(ContinuationToken) if ContinuationToken else 0
        size = self.page_size if self.page_size is not None else max(len(keys), 1)
        chunk = keys[start : start + size]
        next_index = start + len(chunk)
        truncated = next_index < len(keys)
        result: dict = {
            "Contents": [{"Key": key, "LastModified": self.last_modified[key]} for key in chunk],
            "IsTruncated": truncated,
        }
        if truncated:
            result["NextContinuationToken"] = str(next_index)
        return result


def _enable_object_store(monkeypatch, *, endpoint: str = "", region: str = "") -> None:
    monkeypatch.setenv("OBJECT_STORE_BUCKET", "agent-graphs")
    monkeypatch.setenv("OBJECT_STORE_ACCESS_KEY_ID", "test-key")
    monkeypatch.setenv("OBJECT_STORE_SECRET_ACCESS_KEY", "test-secret")
    if endpoint:
        monkeypatch.setenv("OBJECT_STORE_ENDPOINT", endpoint)
    if region:
        monkeypatch.setenv("OBJECT_STORE_REGION", region)


def test_use_object_store_requires_bucket_and_keys(monkeypatch) -> None:
    monkeypatch.setenv("OBJECT_STORE_BUCKET", "agent-graphs")
    monkeypatch.delenv("OBJECT_STORE_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("OBJECT_STORE_SECRET_ACCESS_KEY", raising=False)
    assert storage.use_object_store() is False

    monkeypatch.setenv("OBJECT_STORE_ACCESS_KEY_ID", "ak")
    assert storage.use_object_store() is False

    monkeypatch.setenv("OBJECT_STORE_SECRET_ACCESS_KEY", "sk")
    assert storage.use_object_store() is True


def test_storage_backend_prefers_object_store_over_turso(monkeypatch) -> None:
    assert storage.storage_backend() == "sqlite"

    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://example.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "token")
    assert storage.storage_backend() == "turso"

    _enable_object_store(monkeypatch)
    assert storage.storage_backend() == "object_store"


def test_incomplete_object_store_env_uses_sqlite(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "graphs.db"
    monkeypatch.setenv("GRAPH_DB_PATH", str(db_path))
    monkeypatch.setenv("OBJECT_STORE_BUCKET", "agent-graphs")
    monkeypatch.delenv("OBJECT_STORE_ACCESS_KEY_ID", raising=False)

    graph = build_demo_graph()
    storage.save_graph(graph)

    assert db_path.is_file()
    loaded = storage.get_graph(graph.id)
    assert loaded is not None
    assert loaded.id == graph.id


def test_object_store_persists_graphs_and_lists_newest_first(monkeypatch) -> None:
    _enable_object_store(monkeypatch)
    fake = FakeS3()
    older = build_demo_graph()
    older.updated_at = "2026-01-01T00:00:00+00:00"
    newer = older.model_copy(
        update={
            "id": "graph_newer",
            "name": "Newer graph",
            "updated_at": "2026-06-01T00:00:00+00:00",
        }
    )

    with patch("app.object_store.boto3.client", return_value=fake):
        storage.save_graph(older)
        storage.save_graph(newer)
        loaded = storage.get_graph(newer.id)
        listed = storage.list_graphs()

    assert loaded is not None
    assert loaded.name == "Newer graph"
    assert [graph.id for graph in listed] == ["graph_newer", older.id]
    assert f"graphs/{newer.id}.json" in fake.objects


def test_object_store_missing_graph_returns_none(monkeypatch) -> None:
    _enable_object_store(monkeypatch)
    with patch("app.object_store.boto3.client", return_value=FakeS3()):
        assert storage.get_graph("missing") is None


def test_object_store_run_snapshot_roundtrip(monkeypatch) -> None:
    _enable_object_store(monkeypatch)
    fake = FakeS3()
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

    with patch("app.object_store.boto3.client", return_value=fake):
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


def test_list_runs_for_graph_newest_first_and_limit(monkeypatch) -> None:
    _enable_object_store(monkeypatch)
    fake = FakeS3()
    graph_id = build_demo_graph().id
    first = RunSummary(
        run_id="run_first",
        graph_id=graph_id,
        status="succeeded",
        started_at="2026-01-01T00:00:00+00:00",
        completed_at="2026-01-01T00:00:01+00:00",
    )
    second = RunSummary(
        run_id="run_second",
        graph_id=graph_id,
        status="succeeded",
        started_at="2026-01-02T00:00:00+00:00",
        completed_at="2026-01-02T00:00:01+00:00",
    )

    with patch("app.object_store.boto3.client", return_value=fake):
        storage.save_run_snapshot(first, [])
        storage.save_run_snapshot(second, [])
        listed = storage.list_runs_for_graph(graph_id, limit=1)

    assert [item.run_id for item in listed] == ["run_second"]


def test_object_store_lists_paginated_prefix(monkeypatch) -> None:
    _enable_object_store(monkeypatch)
    fake = FakeS3(page_size=1)
    first = build_demo_graph()
    first.updated_at = "2026-01-01T00:00:00+00:00"
    second = first.model_copy(
        update={"id": "graph_two", "name": "Two", "updated_at": "2026-02-01T00:00:00+00:00"}
    )

    with patch("app.object_store.boto3.client", return_value=fake):
        storage.save_graph(first)
        storage.save_graph(second)
        listed = storage.list_graphs()

    assert {graph.id for graph in listed} == {first.id, "graph_two"}


def test_s3_client_uses_custom_endpoint_and_region(monkeypatch) -> None:
    _enable_object_store(
        monkeypatch,
        endpoint="https://example.r2.cloudflarestorage.com",
        region="auto",
    )
    fake = FakeS3()

    with patch("app.object_store.boto3.client", return_value=fake) as factory:
        object_store.s3_client()

    kwargs = factory.call_args.kwargs
    assert kwargs["endpoint_url"] == "https://example.r2.cloudflarestorage.com"
    assert kwargs["region_name"] == "auto"
    assert kwargs["aws_access_key_id"] == "test-key"


def test_s3_client_defaults_to_aws_when_endpoint_empty(monkeypatch) -> None:
    _enable_object_store(monkeypatch)
    fake = FakeS3()

    with patch("app.object_store.boto3.client", return_value=fake) as factory:
        object_store.s3_client()

    kwargs = factory.call_args.kwargs
    assert "endpoint_url" not in kwargs
    assert kwargs["region_name"] == "us-east-1"


def test_object_store_does_not_write_sqlite(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "graphs.db"
    monkeypatch.setenv("GRAPH_DB_PATH", str(db_path))
    _enable_object_store(monkeypatch)
    fake = FakeS3()

    with patch("app.object_store.boto3.client", return_value=fake):
        storage.save_graph(build_demo_graph())

    assert not db_path.exists()


def test_object_store_delete_graph(monkeypatch) -> None:
    # studio-consolidation Phase 3.
    _enable_object_store(monkeypatch)
    fake = FakeS3()
    graph = build_demo_graph()

    with patch("app.object_store.boto3.client", return_value=fake):
        storage.save_graph(graph)
        assert storage.delete_graph(graph.id) is True
        assert storage.get_graph(graph.id) is None
        assert storage.delete_graph(graph.id) is False


def test_object_store_resource_crud(monkeypatch) -> None:
    # studio-consolidation Phase 3 generic resource store.
    _enable_object_store(monkeypatch)
    fake = FakeS3()

    with patch("app.object_store.boto3.client", return_value=fake):
        assert storage.get_resource("prompts", "p1") is None
        storage.save_resource("prompts", "p1", {"id": "p1", "name": "Greeting", "body": "Hi"})
        storage.save_resource("prompts", "p2", {"id": "p2", "name": "Farewell", "body": "Bye"})

        assert storage.get_resource("prompts", "p1") == {
            "id": "p1",
            "name": "Greeting",
            "body": "Hi",
        }
        listed = storage.list_resources("prompts")
        assert [item["id"] for item in listed] == ["p1", "p2"]

        # A different kind under the same generic prefix must not collide.
        storage.save_resource("tools", "p1", {"id": "p1", "description": "unrelated"})
        assert storage.list_resources("prompts") == listed

        assert storage.delete_resource("prompts", "p1") is True
        assert storage.get_resource("prompts", "p1") is None
        assert storage.delete_resource("prompts", "p1") is False
