"""In-app knowledge base on the API (canvas-workbench-ergonomics-plan.md
§11): the bundled articles, /api/kb, and Chat grounding."""

from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as main_module
from app.chat_context import ChatContext, build_chat_prompt
from app.kb import chat_grounding, get_article, load_articles, node_article_id, search_articles
from app.models import EdgeKind, GraphDefinition, GraphNode, NodeType

client = TestClient(main_module.app)


def test_bundle_covers_every_node_type_and_edge_kind() -> None:
    # Like the studio's lib/kb.test.ts: a new node type or edge kind needs an article.
    missing = [node_article_id(t.value) for t in NodeType if get_article(node_article_id(t.value)) is None]
    missing += [f"edge-{k.value}" for k in EdgeKind if get_article(f"edge-{k.value}") is None]
    assert missing == []
    ids = {article.id for article in load_articles()}
    assert all(related in ids for article in load_articles() for related in article.related)


def test_search_ranks_titles_and_keywords_first() -> None:
    assert search_articles("json pointer")[0].id == "transforms"
    assert search_articles("how do I publish a release")[0].id == "releases"
    assert search_articles("the and of") == []


def test_kb_routes_list_search_and_read() -> None:
    listed = client.get("/api/kb")
    assert listed.status_code == 200
    assert len(listed.json()) == len(load_articles())
    assert "body" not in listed.json()[0]

    found = client.get("/api/kb", params={"q": "fallback"}).json()
    assert found[0]["id"] == "edge-default"

    article = client.get("/api/kb/transforms")
    assert article.status_code == 200
    assert article.json()["title"] == "Transforms"
    assert "JSON Pointer" in article.json()["body"]
    assert client.get("/api/kb/no-such-article").status_code == 404


def test_chat_grounding_picks_the_articles_a_message_is_about() -> None:
    grounding = chat_grounding("How do I reshape a value with a transform?")
    assert grounding is not None
    assert "### Transforms (transforms)" in grounding
    assert "context only" in grounding
    assert chat_grounding("hello there") is None
    # The selected node's type is always included.
    assert "### Human gate node" in (chat_grounding("why?", ["human_gate"]) or "")


def test_chat_prompt_combines_graph_context_and_help() -> None:
    graph = GraphDefinition(
        id="graph_kb_chat",
        name="KB Chat Graph",
        entry_node_id="input_1",
        nodes=[GraphNode(id="input_1", type="input", config={}), GraphNode(id="router_1", type="router", config={})],
        edges=[],
    )
    prompt = build_chat_prompt(ChatContext(graph=graph, selected_node_id="router_1"), "what does this do?")
    assert prompt is not None
    assert "KB Chat Graph" in prompt
    assert "### Router node (node-router)" in prompt
    assert build_chat_prompt(None, "hello there") is None
    assert "### Releases" in (build_chat_prompt(None, "how do releases work") or "")


def test_chat_messages_are_grounded_without_a_graph(monkeypatch) -> None:
    captured: dict = {}

    class RecordingChatModel:
        provider_name = "stub"
        model = "stub"

        async def generate(self, *, system_prompt, user_prompt, history=None):
            captured["system_prompt"] = system_prompt
            return "ok"

    monkeypatch.setattr(main_module, "get_chat_model", lambda **kwargs: RecordingChatModel())
    created = client.post("/api/chat-sessions", json={"id": "chat_kb_grounding", "title": "KB", "provider": "stub", "model": "stub"})
    assert created.status_code in (200, 201), created.text
    try:
        response = client.post("/api/chat-sessions/chat_kb_grounding/messages", json={"content": "How do I add a transform on an edge?"})
        assert response.status_code == 200, response.text
        assert "### Transforms (transforms)" in captured["system_prompt"]
    finally:
        client.delete("/api/chat-sessions/chat_kb_grounding")
