from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_stub_provider_always_ready() -> None:
    response = client.get("/api/providers/stub/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True


def test_groq_provider_ready_without_key(monkeypatch) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    response = client.get("/api/providers/groq/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is False
    assert "GROQ" in body["message"]


def test_groq_provider_ready_with_key(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    response = client.get("/api/providers/groq/ready")
    assert response.status_code == 200
    assert response.json()["ready"] is True


def test_groq_credentials_returns_configured_value(monkeypatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "groq-secret-key")
    response = client.get("/api/providers/groq/credentials")
    assert response.status_code == 200
    body = response.json()
    assert body["requires_api_key"] is True
    assert body["env_var"] == "GROQ_API_KEY"
    assert body["configured"] is True
    assert body["value"] == "groq-secret-key"


def test_stub_credentials_not_required() -> None:
    response = client.get("/api/providers/stub/credentials")
    assert response.status_code == 200
    body = response.json()
    assert body["requires_api_key"] is False
    assert body["value"] == ""
