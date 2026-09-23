"""Studio-consolidation Phase 8: the POST /api/chat-sessions/{id}/messages
route. Resource CRUD itself is covered generically by test_resource_crud.py;
this covers the bespoke send-message behavior (provider call + history
accumulation), using the stub provider so it runs offline/deterministically
like every other provider-adapter test in this suite.

See docs/planning/features/studio-consolidation-plan.md.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as main_module
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


# Chat context binding (studio-ux-gap-remediation-plan.md §3, STO-596).


def test_send_message_with_context_passes_a_system_prompt_to_the_model(monkeypatch) -> None:
    captured: dict = {}

    class RecordingChatModel:
        provider_name = "stub"
        model = "stub"

        async def generate(self, *, system_prompt, user_prompt, history=None):
            captured["system_prompt"] = system_prompt
            return f"[stub answer] {user_prompt}"

    monkeypatch.setattr(main_module, "get_chat_model", lambda **kwargs: RecordingChatModel())

    session_id = "chat_send_with_context"
    _create_session(session_id)
    graph = {
        "id": "graph_chat_ctx",
        "name": "Chat Context Graph",
        "entry_node_id": "input_1",
        "nodes": [{"id": "input_1", "type": "input", "config": {}}],
        "edges": [],
    }
    try:
        response = client.post(
            f"/api/chat-sessions/{session_id}/messages",
            json={"content": "why is this failing?", "context": {"graph": graph, "selected_node_id": "input_1"}},
        )
        assert response.status_code == 200, response.text
        assert captured["system_prompt"] is not None
        assert "Chat Context Graph" in captured["system_prompt"]
        assert "Selected node: input_1" in captured["system_prompt"]
    finally:
        client.delete(f"/api/chat-sessions/{session_id}")


def test_send_message_with_context_does_not_persist_it_to_the_transcript() -> None:
    session_id = "chat_context_not_persisted"
    _create_session(session_id)
    graph = {
        "id": "graph_chat_ctx_2",
        "name": "Another Graph",
        "entry_node_id": "input_1",
        "nodes": [{"id": "input_1", "type": "input", "config": {}}],
        "edges": [],
    }
    try:
        response = client.post(
            f"/api/chat-sessions/{session_id}/messages",
            json={"content": "hello", "context": {"graph": graph}},
        )
        assert response.status_code == 200, response.text
        session = response.json()
        assert len(session["messages"]) == 2
        assert session["messages"][0]["content"] == "hello"
        assert "Another Graph" not in str(session["messages"])
    finally:
        client.delete(f"/api/chat-sessions/{session_id}")


def test_send_message_without_context_is_unchanged() -> None:
    """Regression: omitting `context` entirely must behave exactly as
    before STO-596 (no system prompt, plain echo)."""
    session_id = "chat_send_no_context"
    _create_session(session_id)
    try:
        response = client.post(
            f"/api/chat-sessions/{session_id}/messages", json={"content": "hello there"}
        )
        assert response.status_code == 200, response.text
        session = response.json()
        assert session["messages"][1]["content"] == "[stub answer] hello there"
    finally:
        client.delete(f"/api/chat-sessions/{session_id}")


def test_chat_run_reference_round_trips_and_survives_later_turns() -> None:
    """STO-600: a run started from Chat is stored on an assistant message as a
    reference; later model turns keep it and only send plain content as history."""
    session_id = "chat_run_ref"
    session = _create_session(session_id)
    try:
        run_ref = {
            "run_id": "run_abc",
            "graph_id": "demo_classify_and_route",
            "graph_name": "Classify & Route (demo)",
            "source": "release",
            "release_id": "rel_123",
            "input": {"question": "TCP?"},
        }
        session["messages"] = [
            {"role": "user", "content": "/run demo_classify_and_route@latest TCP?"},
            {"role": "assistant", "content": "Started Classify & Route (demo) (release rel_123).", "run": run_ref},
        ]
        updated = client.put(f"/api/chat-sessions/{session_id}", json=session)
        assert updated.status_code == 200, updated.text
        assert updated.json()["messages"][1]["run"] == run_ref

        reply = client.post(f"/api/chat-sessions/{session_id}/messages", json={"content": "thanks"})
        assert reply.status_code == 200, reply.text
        messages = reply.json()["messages"]
        assert len(messages) == 4
        assert messages[1]["run"] == run_ref
        assert messages[0]["run"] is None and messages[3]["run"] is None
    finally:
        client.delete(f"/api/chat-sessions/{session_id}")
