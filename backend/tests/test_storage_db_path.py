"""SQLite path resolution for local dev vs Vercel serverless."""

from __future__ import annotations

from app import storage


def test_resolve_db_path_uses_explicit_env(monkeypatch, tmp_path) -> None:
    target = tmp_path / "custom" / "graphs.db"
    monkeypatch.setenv("GRAPH_DB_PATH", str(target))
    monkeypatch.delenv("VERCEL", raising=False)
    assert storage.resolve_db_path() == target


def test_resolve_db_path_vercel_fallback_when_env_missing(monkeypatch) -> None:
    monkeypatch.delenv("GRAPH_DB_PATH", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    assert storage.resolve_db_path() == storage._VERCEL_EPHEMERAL_DB


def test_connect_creates_parent_directory(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "nested" / "graphs.db"
    monkeypatch.setenv("GRAPH_DB_PATH", str(db_path))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)

    with storage._connect() as conn:
        conn.execute("select 1")

    assert db_path.is_file()


def test_vercel_without_durable_storage_fails_closed(monkeypatch) -> None:
    """Vercel without durable storage must not serve API routes with ephemeral SQLite."""
    monkeypatch.delenv("GRAPH_DB_PATH", raising=False)
    monkeypatch.delenv("OBJECT_STORE_BUCKET", raising=False)
    monkeypatch.delenv("OBJECT_STORE_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("OBJECT_STORE_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("VERCEL", "1")

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 503
        assert health.json()["storage_backend"] == "sqlite"

        response = client.get("/api/graphs")
        assert response.status_code == 503
        assert response.json()["ok"] is False
