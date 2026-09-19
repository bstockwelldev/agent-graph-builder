"""P0 graph foundation, Slice A: release storage primitives (SQLite path,
the CI-default backend). No publish route exists yet — these exercise the
primitives directly. Each test isolates its own DB file (matching
test_storage_db_path.py's convention) since save_release does a plain
insert, not an upsert — a shared/persistent DB across runs would collide
on the release_id primary key."""

from __future__ import annotations

import pytest

from app import storage


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def test_release_key_naming_matches_the_design_doc() -> None:
    assert storage._release_key("g1", "r1") == "graph_releases/g1/r1.json"
    assert storage._release_index_key("g1") == "graph_release_index/g1.json"


def test_save_and_get_release_round_trip() -> None:
    payload = {"id": "r1", "nodes": [], "edges": []}
    storage.save_release(
        "r1",
        "g1",
        payload,
        semantic_fingerprint="sem1",
        document_fingerprint="doc1",
        created_at="2026-09-19T00:00:00Z",
    )
    assert storage.get_release("r1", "g1") == payload


def test_get_release_returns_none_for_unknown_id() -> None:
    assert storage.get_release("does-not-exist", "g1") is None


def test_release_index_is_empty_for_unknown_graph() -> None:
    assert storage.get_release_index("unknown-graph") == []


def test_release_index_lists_entries_in_insertion_order() -> None:
    storage.save_release(
        "r1",
        "g2",
        {"id": "r1"},
        semantic_fingerprint="sem1",
        document_fingerprint="doc1",
        created_at="2026-09-19T00:00:00Z",
    )
    storage.save_release(
        "r2",
        "g2",
        {"id": "r2"},
        semantic_fingerprint="sem2",
        document_fingerprint="doc2",
        created_at="2026-09-19T00:01:00Z",
    )
    index = storage.get_release_index("g2")
    assert [entry["release_id"] for entry in index] == ["r1", "r2"]


def test_two_releases_with_different_semantic_fingerprints_both_appear() -> None:
    """Proves the index-table design (multiple releases per graph), not an
    overwriting single-value store."""
    storage.save_release(
        "r1",
        "g3",
        {"id": "r1"},
        semantic_fingerprint="sem_a",
        document_fingerprint="doc_a",
        created_at="2026-09-19T00:00:00Z",
    )
    storage.save_release(
        "r2",
        "g3",
        {"id": "r2"},
        semantic_fingerprint="sem_b",
        document_fingerprint="doc_b",
        created_at="2026-09-19T00:01:00Z",
    )
    index = storage.get_release_index("g3")
    assert {entry["semantic_fingerprint"] for entry in index} == {"sem_a", "sem_b"}
    assert storage.get_release("r1", "g3") == {"id": "r1"}
    assert storage.get_release("r2", "g3") == {"id": "r2"}
