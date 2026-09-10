"""Turso / libsql backend selection and mocked remote path."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app import storage
from app.demo_graph import build_demo_graph


def test_use_turso_requires_both_env_vars(monkeypatch) -> None:
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://example.turso.io")
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    assert storage.use_turso() is False

    monkeypatch.setenv("TURSO_AUTH_TOKEN", "token")
    assert storage.use_turso() is True


def test_storage_backend_label(monkeypatch) -> None:
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    assert storage.storage_backend() == "sqlite"

    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://example.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "token")
    assert storage.storage_backend() == "turso"


def test_turso_connect_bootstraps_and_persists_graph(monkeypatch) -> None:
    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchall.return_value = []
    mock_conn.execute.return_value.fetchone.return_value = None

    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://example.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "test-token")

    with patch("libsql.connect", return_value=mock_conn) as connect:
        graph = build_demo_graph()
        storage.save_graph(graph)

    connect.assert_called_once_with(
        database="libsql://example.turso.io",
        auth_token="test-token",
    )
    mock_conn.commit.assert_called()
    mock_conn.close.assert_called()
    executed_sql = " ".join(call.args[0].lower() for call in mock_conn.execute.call_args_list)
    assert "create table if not exists graph" in executed_sql


def test_file_sqlite_when_turso_env_incomplete(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "graphs.db"
    monkeypatch.setenv("GRAPH_DB_PATH", str(db_path))
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://example.turso.io")
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)

    graph = build_demo_graph()
    storage.save_graph(graph)

    assert db_path.is_file()
    loaded = storage.get_graph(graph.id)
    assert loaded is not None
    assert loaded.id == graph.id
