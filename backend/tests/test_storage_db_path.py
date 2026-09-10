"""SQLite path resolution for local dev vs Vercel serverless."""

from __future__ import annotations

import pytest

from app import storage
from app.demo_graph import build_demo_graph


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

    with storage._connect() as conn:
        conn.execute("select 1")

    assert db_path.is_file()


def test_bootstrap_succeeds_on_vercel_without_graph_db_path(monkeypatch, tmp_path) -> None:
    """Startup must not fail when GRAPH_DB_PATH is unset on Vercel."""
    vercel_db = tmp_path / "tmp" / "graphs.db"
    monkeypatch.delenv("GRAPH_DB_PATH", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(storage, "_VERCEL_EPHEMERAL_DB", vercel_db)

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        response = client.get("/api/graphs")
        assert response.status_code == 200
        assert any(g["id"] == build_demo_graph().id for g in response.json())
