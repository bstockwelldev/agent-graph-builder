"""Studio-consolidation Phase 8: the POST /api/chat-sessions/{id}/messages
route. Resource CRUD itself is covered generically by test_resource_crud.py;
this covers the bespoke send-message behavior (provider call + history
accumulation), using the stub provider so it runs offline/deterministically
like every other provider-adapter test in this suite.

See docs/planning/features/studio-consolidation-plan.md.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_session(session_id: str = "chat_session_test") -> dict:
    body = {"id": session_id, "title": "Test scratchpad", "provider": "stub", "model": "stub"}
    response = client.post("/api/chat-sessions", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_send_message_appends_user_and_assistant_turns() -> None:
    session_id = "chat_send_basic"
    _create_session(session_id)
    try:
        response = client.post(
            f"/api/chat-sessions/{session_id}/messages", json={"content": "hello there"}
        )
        assert response.status_code == 200, response.text
        session = response.json()
        assert len(session["messages"]) == 2
        assert session["messages"][0]["role"] == "user"
        assert session["messages"][0]["content"] == "hello there"
        assert session["messages"][1]["role"] == "assistant"
        assert "hello there" in session["messages"][1]["content"]
    finally:
        client.delete(f"/api/chat-sessions/{session_id}")


def test_send_message_persists_across_turns() -> None:
    session_id = "chat_send_multi_turn"
    _create_session(session_id)
    try:
        client.post(f"/api/chat-sessions/{session_id}/messages", json={"content": "first"})
        second = client.post(
            f"/api/chat-sessions/{session_id}/messages", json={"content": "second"}
        )
        assert second.status_code == 200, second.text
        session = second.json()
        # Two turns, each contributing a user + assistant message.
        assert len(session["messages"]) == 4
        assert [m["role"] for m in session["messages"]] == [
            "user",
            "assistant",
            "user",
            "assistant",
        ]

        fetched = client.get(f"/api/chat-sessions/{session_id}")
        assert fetched.status_code == 200
        assert len(fetched.json()["messages"]) == 4
    finally:
        client.delete(f"/api/chat-sessions/{session_id}")


def test_send_message_to_unknown_session_returns_404() -> None:
    response = client.post(
        "/api/chat-sessions/does_not_exist/messages", json={"content": "hi"}
    )
    assert response.status_code == 404
