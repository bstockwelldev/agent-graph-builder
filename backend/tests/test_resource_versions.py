"""P1 rollout plan, parallel track "Versioned reusable entity registry":
publish_resource_version orchestration, its idempotency, and the API
routes. Mirrors test_releases.py/test_release_api.py's conventions."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app
from app.resource_versions import (
    ResourceNotFound,
    UnversionableResourceKind,
    get_resource_version,
    list_resource_versions,
    publish_resource_version,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)


def test_publish_resource_version_succeeds() -> None:
    storage.save_resource("prompts", "p1", {"id": "p1", "name": "Greeting", "body": "Hi {name}"})
    response = publish_resource_version("prompts", "p1")
    assert response.created is True
    assert response.version.kind == "prompts"
    assert response.version.resource_id == "p1"
    assert response.version.payload == {"id": "p1", "name": "Greeting", "body": "Hi {name}"}
    assert len(response.version.fingerprint) == 64


def test_publish_resource_version_raises_for_unknown_resource() -> None:
    with pytest.raises(ResourceNotFound):
        publish_resource_version("prompts", "does_not_exist")


def test_publish_resource_version_raises_for_unversionable_kind() -> None:
    storage.save_resource(
        "chat_sessions", "s1", {"id": "s1", "title": "t", "provider": "stub", "model": "stub"}
    )
    with pytest.raises(UnversionableResourceKind):
        publish_resource_version("chat_sessions", "s1")


def test_publish_resource_version_is_idempotent_on_unchanged_payload() -> None:
    storage.save_resource("prompts", "p2", {"id": "p2", "name": "A", "body": "b"})
    first = publish_resource_version("prompts", "p2")
    second = publish_resource_version("prompts", "p2")

    assert first.created is True
    assert second.created is False
    assert second.version.version_id == first.version.version_id
    assert len(list_resource_versions("prompts", "p2")) == 1


def test_publish_resource_version_creates_new_version_on_real_change() -> None:
    storage.save_resource("prompts", "p3", {"id": "p3", "name": "A", "body": "b"})
    first = publish_resource_version("prompts", "p3")

    storage.save_resource("prompts", "p3", {"id": "p3", "name": "A", "body": "changed"})
    second = publish_resource_version("prompts", "p3")

    assert second.created is True
    assert second.version.version_id != first.version.version_id
    assert len(list_resource_versions("prompts", "p3")) == 2


def test_publish_resource_version_dedupes_against_any_prior_version_not_just_latest() -> None:
    """Reverting a resource back to an earlier payload republishes the
    original version rather than creating a new duplicate — same as
    releases.publish_release's whole-index dedup, not just a last-entry
    check."""
    storage.save_resource("prompts", "p4", {"id": "p4", "name": "A", "body": "v1"})
    v1 = publish_resource_version("prompts", "p4")

    storage.save_resource("prompts", "p4", {"id": "p4", "name": "A", "body": "v2"})
    publish_resource_version("prompts", "p4")

    storage.save_resource("prompts", "p4", {"id": "p4", "name": "A", "body": "v1"})
    reverted = publish_resource_version("prompts", "p4")

    assert reverted.created is False
    assert reverted.version.version_id == v1.version.version_id
    assert len(list_resource_versions("prompts", "p4")) == 2


def test_editing_the_resource_after_publish_does_not_change_the_version() -> None:
    storage.save_resource("prompts", "p5", {"id": "p5", "name": "A", "body": "original"})
    published = publish_resource_version("prompts", "p5")

    storage.save_resource("prompts", "p5", {"id": "p5", "name": "A", "body": "mutated"})

    reread = get_resource_version("prompts", "p5", published.version.version_id)
    assert reread is not None
    assert reread.payload["body"] == "original"


def test_publish_version_endpoint_round_trip() -> None:
    storage.save_resource("tools", "t1", {"id": "t1", "description": "d"})
    response = client.post("/api/tools/t1/versions")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] is True
    version_id = body["version"]["version_id"]

    list_response = client.get("/api/tools/t1/versions")
    assert list_response.status_code == 200
    assert [v["version_id"] for v in list_response.json()] == [version_id]

    get_response = client.get(f"/api/tools/t1/versions/{version_id}")
    assert get_response.status_code == 200
    assert get_response.json()["version_id"] == version_id


def test_publish_version_endpoint_404_for_unknown_resource() -> None:
    response = client.post("/api/tools/does_not_exist/versions")
    assert response.status_code == 404


def test_get_version_endpoint_404_for_unknown_version() -> None:
    storage.save_resource("tools", "t2", {"id": "t2", "description": "d"})
    response = client.get("/api/tools/t2/versions/rver_missing")
    assert response.status_code == 404


def test_chat_sessions_has_no_version_routes() -> None:
    """chat_sessions is deliberately excluded from VERSIONABLE_RESOURCE_KINDS
    (a runtime scratchpad, not a reusable authored asset) — its version
    routes were never registered, so the versions path 404s at the
    FastAPI-route-matching level, same as any nonexistent route."""
    assert client.post("/api/chat-sessions/s1/versions").status_code == 404
