"""Storage health diagnostics and Vercel fail-closed behavior."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage, supabase_store
from app.demo_graph import build_demo_graph
from app.main import app


def _clear_durable_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OBJECT_STORE_BUCKET", raising=False)
    monkeypatch.delenv("OBJECT_STORE_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("OBJECT_STORE_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)


def _enable_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")


def test_storage_is_healthy_local_sqlite(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_durable_env(monkeypatch)
    monkeypatch.delenv("VERCEL", raising=False)
    assert storage.storage_backend() == "sqlite"
    assert storage.storage_is_healthy() is True


def test_storage_is_unhealthy_on_vercel_without_durable_backend(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_durable_env(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")
    assert storage.storage_backend() == "sqlite"
    assert storage.storage_is_healthy() is False
    payload = storage.storage_health()
    assert payload == {
        "ok": False,
        "storage_backend": "sqlite",
        "message": storage.STORAGE_MISCONFIGURED_DETAIL,
    }


def test_storage_is_healthy_on_vercel_with_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_durable_env(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")
    _enable_supabase(monkeypatch)
    assert storage.storage_backend() == "supabase"
    assert storage.storage_is_healthy() is True


def test_leftover_blob_token_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    """The Vercel Blob backend was removed; a stale token must not revive it
    or count as durable storage."""
    _clear_durable_env(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_teststore_testtoken")
    assert storage.storage_backend() == "sqlite"
    assert storage.storage_is_healthy() is False


def test_connect_raises_on_vercel_without_durable_backend(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_durable_env(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")
    with pytest.raises(storage.StorageMisconfiguredError, match="durable storage"):
        with storage._connect():
            pass


def test_health_reports_unhealthy_on_vercel_sqlite(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_durable_env(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {
        "ok": False,
        "storage_backend": "sqlite",
        "message": storage.STORAGE_MISCONFIGURED_DETAIL,
        "telemetry": {"ok": True, "telemetry_provider": "noop", "telemetry_configured": True},
    }


def test_health_reports_healthy_on_vercel_with_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_durable_env(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")
    _enable_supabase(monkeypatch)
    monkeypatch.setattr(storage.supabase_store, "get_graph", lambda graph_id: build_demo_graph())
    monkeypatch.setattr(storage.supabase_store, "save_graph", lambda graph: None)

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "storage_backend": "supabase",
        "supabase_key": supabase_store.key_kind(),
        "telemetry": {"ok": True, "telemetry_provider": "noop", "telemetry_configured": True},
    }


def test_health_reports_healthy_local_sqlite(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_durable_env(monkeypatch)
    monkeypatch.delenv("VERCEL", raising=False)

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "storage_backend": "sqlite",
        "telemetry": {"ok": True, "telemetry_provider": "noop", "telemetry_configured": True},
    }


def test_api_routes_fail_closed_on_vercel_sqlite(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_durable_env(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")

    with TestClient(app) as client:
        response = client.get("/api/graphs")

    assert response.status_code == 503
    assert response.json()["ok"] is False
    assert response.json()["storage_backend"] == "sqlite"


def test_api_routes_work_on_vercel_with_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_durable_env(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")
    _enable_supabase(monkeypatch)
    monkeypatch.setattr(storage.supabase_store, "list_graphs", lambda: [build_demo_graph()])
    monkeypatch.setattr(storage.supabase_store, "get_graph", lambda graph_id: build_demo_graph())
    monkeypatch.setattr(storage.supabase_store, "save_graph", lambda graph: None)

    with TestClient(app) as client:
        response = client.get("/api/graphs")

    assert response.status_code == 200
    assert any(graph["id"] == build_demo_graph().id for graph in response.json())


def test_startup_survives_unavailable_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    """A suspended/unreachable store must not crash app startup (prod
    outage 2026-09-24: Blob 403 in the demo-graph seed killed every request)."""
    _clear_durable_env(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")
    _enable_supabase(monkeypatch)

    def _forbidden(graph_id: str):
        raise RuntimeError("403 Forbidden")

    monkeypatch.setattr(storage.supabase_store, "get_graph", _forbidden)

    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["storage_backend"] == "supabase"
