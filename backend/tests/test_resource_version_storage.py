"""P1 rollout plan, parallel track "Versioned reusable entity registry":
resource version storage primitives (SQLite path, the CI-default backend).
Mirrors test_release_storage.py's conventions."""

from __future__ import annotations

import pytest

from app import storage


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def test_resource_version_key_naming() -> None:
    assert (
        storage._resource_version_key("prompts", "p1", "v1")
        == "resource_versions/prompts/p1/v1.json"
    )
    assert (
        storage._resource_version_index_key("prompts", "p1")
        == "resource_version_index/prompts/p1.json"
    )


def test_save_and_get_resource_version_round_trip() -> None:
    payload = {"version_id": "v1", "kind": "prompts", "resource_id": "p1", "payload": {"id": "p1"}}
    storage.save_resource_version(
        "prompts", "p1", "v1", payload, fingerprint="fp1", created_at="2026-09-20T00:00:00Z"
    )
    assert storage.get_resource_version("prompts", "p1", "v1") == payload


def test_get_resource_version_returns_none_for_unknown_id() -> None:
    assert storage.get_resource_version("prompts", "p1", "does-not-exist") is None


def test_resource_version_index_is_empty_for_unknown_resource() -> None:
    assert storage.get_resource_version_index("prompts", "unknown") == []


def test_resource_version_index_lists_entries_in_insertion_order() -> None:
    storage.save_resource_version(
        "prompts", "p2", "v1", {"id": "v1"}, fingerprint="fp1", created_at="2026-09-20T00:00:00Z"
    )
    storage.save_resource_version(
        "prompts", "p2", "v2", {"id": "v2"}, fingerprint="fp2", created_at="2026-09-20T00:01:00Z"
    )
    index = storage.get_resource_version_index("prompts", "p2")
    assert [entry["version_id"] for entry in index] == ["v1", "v2"]


def test_two_versions_with_different_fingerprints_both_appear() -> None:
    storage.save_resource_version(
        "tools", "t1", "v1", {"id": "v1"}, fingerprint="fp_a", created_at="2026-09-20T00:00:00Z"
    )
    storage.save_resource_version(
        "tools", "t1", "v2", {"id": "v2"}, fingerprint="fp_b", created_at="2026-09-20T00:01:00Z"
    )
    index = storage.get_resource_version_index("tools", "t1")
    assert {entry["fingerprint"] for entry in index} == {"fp_a", "fp_b"}
    assert storage.get_resource_version("tools", "t1", "v1") == {"id": "v1"}
    assert storage.get_resource_version("tools", "t1", "v2") == {"id": "v2"}


def test_versions_are_scoped_per_kind_and_resource_id() -> None:
    """Two different kinds sharing a resource id never collide in the
    index — the index is keyed (kind, resource_id, version_id), matching
    resource.py's own (kind, id) resource primary key. version_id itself
    (like release_id) is always globally unique in practice
    (`rver_{uuid4().hex[:12]}`), so the payload table's plain version_id
    primary key never collides for two real publishes."""
    storage.save_resource_version(
        "prompts",
        "shared_id",
        "v_prompts",
        {"k": "prompts"},
        fingerprint="fp",
        created_at="2026-09-20T00:00:00Z",
    )
    storage.save_resource_version(
        "tools",
        "shared_id",
        "v_tools",
        {"k": "tools"},
        fingerprint="fp",
        created_at="2026-09-20T00:00:00Z",
    )
    assert storage.get_resource_version("prompts", "shared_id", "v_prompts") == {"k": "prompts"}
    assert storage.get_resource_version("tools", "shared_id", "v_tools") == {"k": "tools"}
    assert [
        e["version_id"] for e in storage.get_resource_version_index("prompts", "shared_id")
    ] == ["v_prompts"]
    assert [e["version_id"] for e in storage.get_resource_version_index("tools", "shared_id")] == [
        "v_tools"
    ]
