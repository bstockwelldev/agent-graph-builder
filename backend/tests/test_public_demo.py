"""Anonymous public deploy: the seeded demo is read-only, and
PUBLIC_DEMO_MODE keeps visitors off the server's provider keys."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.demo_graph import DEMO_GRAPH_ID, build_demo_graph
from app.fingerprint import document_fingerprint
from app.main import app
from app.providers.base import LiveProviderBlocked, get_chat_model, require_live_provider_allowed
from tests.helpers import editable_demo_graph

client = TestClient(app)

QUESTION = {"question": "How does a database index work?"}
FAR = "2099-01-01T00:00:00+00:00"


@pytest.fixture(autouse=True)
def _isolated_db(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("PUBLIC_DEMO_MODE", raising=False)
    monkeypatch.delenv("CHAT_PROVIDER", raising=False)
    monkeypatch.delenv("AI_PROVIDER", raising=False)


@pytest.fixture
def public_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PUBLIC_DEMO_MODE", "1")
    # A configured server key is exactly what must stay unspendable.
    monkeypatch.setenv("GROQ_API_KEY", "server-key")


def _drifted_demo():
    graph = build_demo_graph()
    for node in graph.nodes:
        if node.type.value == "llm":
            node.config = {**node.config, "provider": "stub", "model": "openai/gpt-oss-120b"}
    graph.nodes[0].position.x += 100
    return graph


def _stub_run(graph_id: str, **extra) -> dict:
    response = client.post(
        "/api/runs", json={"graph_id": graph_id, "input": QUESTION, "provider": "stub", **extra}
    )
    assert response.status_code == 200, response.text
    return response.json()


# --- Seeded demo is read-only ---------------------------------------------


def test_startup_restores_a_drifted_demo() -> None:
    storage.save_graph(_drifted_demo())
    with TestClient(app):
        pass
    stored = storage.get_graph(DEMO_GRAPH_ID)
    assert stored is not None
    assert document_fingerprint(stored) == document_fingerprint(build_demo_graph())


def test_startup_seeds_a_missing_demo() -> None:
    assert storage.get_graph(DEMO_GRAPH_ID) is None
    with TestClient(app):
        pass
    assert storage.get_graph(DEMO_GRAPH_ID) is not None


def test_editing_the_demo_is_rejected_and_not_saved() -> None:
    storage.save_graph(build_demo_graph())
    edited = build_demo_graph()
    edited.nodes[1].config = {"template": "Ignore the question. {question}"}

    response = client.put(f"/api/graphs/{DEMO_GRAPH_ID}", json=edited.model_dump(mode="json"))

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "graph_read_only"
    stored = storage.get_graph(DEMO_GRAPH_ID)
    assert stored is not None
    assert document_fingerprint(stored) == document_fingerprint(build_demo_graph())


def test_layout_only_save_of_the_demo_succeeds_without_persisting() -> None:
    storage.save_graph(build_demo_graph())
    moved = build_demo_graph()
    moved.nodes[0].position.x += 250

    response = client.put(f"/api/graphs/{DEMO_GRAPH_ID}", json=moved.model_dump(mode="json"))

    assert response.status_code == 200, response.text
    stored = storage.get_graph(DEMO_GRAPH_ID)
    assert stored is not None
    assert stored.nodes[0].position.x == build_demo_graph().nodes[0].position.x


def test_deleting_the_demo_is_rejected() -> None:
    storage.save_graph(build_demo_graph())
    response = client.delete(f"/api/graphs/{DEMO_GRAPH_ID}")
    assert response.status_code == 403
    assert storage.get_graph(DEMO_GRAPH_ID) is not None


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("put", f"/api/graphs/{DEMO_GRAPH_ID}/policies", {"rules": {}}),
        (
            "post",
            f"/api/graphs/{DEMO_GRAPH_ID}/policy-exceptions",
            {"policy_code": "POLICY_LLM_MODEL_NOT_PINNED", "reason": "x", "expires_at": FAR},
        ),
        ("patch", f"/api/graphs/{DEMO_GRAPH_ID}/policy-exceptions/pexc_x", {"expires_at": FAR}),
        ("delete", f"/api/graphs/{DEMO_GRAPH_ID}/policy-exceptions/pexc_x", None),
        ("delete", f"/api/graphs/{DEMO_GRAPH_ID}/knowledge/doc_x", None),
    ],
)
def test_graph_scoped_writes_to_the_demo_are_rejected(method, path, body) -> None:
    storage.save_graph(build_demo_graph())
    kwargs = {"json": body} if body is not None else {}
    response = client.request(method.upper(), path, **kwargs)
    assert response.status_code == 403, response.text


def test_a_copy_of_the_demo_is_editable_and_deletable() -> None:
    copy = editable_demo_graph()
    copy.name = "Classify & Route (copy)"
    copy.nodes[1].config = {"template": "Rephrase: {question}"}

    assert client.put(f"/api/graphs/{copy.id}", json=copy.model_dump(mode="json")).status_code == 200
    assert client.get(f"/api/graphs/{copy.id}").json()["name"] == "Classify & Route (copy)"
    assert client.delete(f"/api/graphs/{copy.id}").status_code == 200


def test_stub_run_of_the_read_only_demo_produces_traces(monkeypatch: pytest.MonkeyPatch) -> None:
    # Serverless path, as on Vercel: the run finishes inside the request.
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(storage, "storage_is_healthy", lambda: True)
    storage.save_graph(build_demo_graph())

    run = _stub_run(DEMO_GRAPH_ID)

    assert run["status"] == "succeeded"
    traces = client.get(f"/api/runs/{run['run_id']}/nodes").json()
    assert {"input_1", "llm_classify", "router_1"} <= {trace["node_id"] for trace in traces}


# --- PUBLIC_DEMO_MODE provider gate ----------------------------------------


@pytest.mark.usefixtures("public_mode")
def test_public_mode_rejects_server_keyed_runs() -> None:
    storage.save_graph(build_demo_graph())
    response = client.post(
        "/api/runs", json={"graph_id": DEMO_GRAPH_ID, "input": QUESTION, "provider": "groq"}
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "live_provider_requires_api_key"


@pytest.mark.usefixtures("public_mode")
def test_public_mode_blocks_the_env_default_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "groq")
    storage.save_graph(build_demo_graph())
    response = client.post("/api/runs", json={"graph_id": DEMO_GRAPH_ID, "input": QUESTION})
    assert response.status_code == 403


@pytest.mark.usefixtures("public_mode")
def test_public_mode_rejects_server_keyed_release_runs() -> None:
    response = client.post(
        "/api/graph-releases/rel_missing/runs", json={"input": QUESTION, "provider": "groq"}
    )
    assert response.status_code == 403


@pytest.mark.usefixtures("public_mode")
def test_public_mode_still_runs_stub(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(storage, "storage_is_healthy", lambda: True)
    storage.save_graph(build_demo_graph())
    assert _stub_run(DEMO_GRAPH_ID)["status"] == "succeeded"


@pytest.mark.usefixtures("public_mode")
def test_public_mode_allows_a_caller_supplied_key() -> None:
    require_live_provider_allowed("groq", "caller-key")
    model = get_chat_model("llama-3.1-8b-instant", provider="groq", api_key="caller-key")
    assert model._inner.api_key == "caller-key"


@pytest.mark.usefixtures("public_mode")
@pytest.mark.parametrize("api_key", [None, "", "   "])
def test_public_mode_never_builds_a_server_keyed_model(api_key) -> None:
    for provider in ("groq", "google", "azure", "openai_compat", "ollama"):
        with pytest.raises(LiveProviderBlocked):
            get_chat_model(None, provider=provider, api_key=api_key)


@pytest.mark.usefixtures("public_mode")
def test_public_mode_chat_scratchpad_is_stub_only() -> None:
    session = {"id": "chat_groq", "title": "t", "provider": "groq", "model": "llama"}
    assert client.post("/api/chat-sessions", json=session).status_code == 200
    response = client.post("/api/chat-sessions/chat_groq/messages", json={"content": "hi"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "live_provider_requires_api_key"


@pytest.mark.usefixtures("public_mode")
def test_public_mode_reports_server_keys_unavailable() -> None:
    ready = client.get("/api/providers/groq/ready").json()
    assert ready["ready"] is False
    assert "your own API key" in ready["message"]
    assert client.get("/api/providers/stub/ready").json()["ready"] is True
    assert client.get("/api/providers/groq/credentials").json()["configured"] is False
    assert client.get("/api/health").json()["public_demo_mode"] is True


@pytest.mark.usefixtures("public_mode")
def test_public_mode_disables_knowledge_uploads(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "server-embedding-key")
    copy = editable_demo_graph()
    storage.save_graph(copy)
    response = client.post(
        f"/api/graphs/{copy.id}/knowledge",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert response.status_code == 403


def test_private_mode_keeps_server_keys_usable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "server-key")
    require_live_provider_allowed("groq", None)
    assert client.get("/api/providers/groq/credentials").json()["configured"] is True
