"""Slice 3 (resource-forms-consistency-plan): MCP server headers kept as
write-only secrets, tool discovery, and tool registry rules."""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app

SERVER = {"id": "srv_docs", "name": "Docs MCP", "url": "https://mcp.example.com/rpc"}


@pytest.fixture
def api(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("GRAPH_DB_PATH", str(tmp_path / "graphs.db"))
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("PUBLIC_DEMO_MODE", raising=False)
    with TestClient(app) as client:
        assert client.post("/api/mcp-servers", json=SERVER).status_code == 200
        yield client


class _FakeServer:
    """Answers the MCP handshake and tools/list, recording request headers."""

    def __init__(self, *, status: int = 200) -> None:
        self.status = status
        self.headers: list[dict[str, str]] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.headers.append(dict(request.headers))
        if self.status != 200:
            return httpx.Response(self.status)
        method = json.loads(request.content)["method"]
        if method == "notifications/initialized":
            return httpx.Response(200)
        if method == "tools/list":
            tool = {
                "name": "search_docs",
                "description": "Search the docs",
                "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}},
            }
            return httpx.Response(
                200, json={"jsonrpc": "2.0", "id": 1, "result": {"tools": [tool, {"x": 1}]}}
            )
        if method == "tools/call":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {"hits": 3}})
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {}})


def _use(monkeypatch: pytest.MonkeyPatch, fake: _FakeServer) -> None:
    class _Client(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(fake.handle)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("app.mcp.client.httpx.AsyncClient", _Client)


def test_headers_are_write_only_and_kept_out_of_the_resource(api: TestClient) -> None:
    saved = api.put(
        "/api/mcp-servers/srv_docs/headers",
        json={"headers": {"Authorization": "Bearer s3cret", "X-Team": "docs"}},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json() == {"names": ["Authorization", "X-Team"]}
    assert api.get("/api/mcp-servers/srv_docs/headers").json() == {
        "names": ["Authorization", "X-Team"]
    }
    # Nowhere the resource document goes (reads, versions, release
    # snapshots) carries the secret.
    assert "s3cret" not in api.get("/api/mcp-servers/srv_docs").text
    assert "s3cret" not in api.get("/api/mcp-servers").text

    # null keeps a stored value; a name left out is removed.
    kept = api.put(
        "/api/mcp-servers/srv_docs/headers", json={"headers": {"Authorization": None}}
    )
    assert kept.json() == {"names": ["Authorization"]}
    stored = storage.get_resource("mcp_server_secrets", "srv_docs")
    assert stored == {"id": "srv_docs", "headers": {"Authorization": "Bearer s3cret"}}


@pytest.mark.parametrize(
    "headers",
    [
        {"Bad Name": "x"},
        {"X-New": None},
        {"X-Split": "a\r\nInjected: 1"},
        {"X-Blank": "  "},
        {"x-dup": "a", "X-Dup": "b"},
    ],
)
def test_invalid_headers_are_refused(api: TestClient, headers: dict) -> None:
    response = api.put("/api/mcp-servers/srv_docs/headers", json={"headers": headers})
    assert response.status_code == 422


def test_deleting_a_server_deletes_its_headers(api: TestClient) -> None:
    api.put("/api/mcp-servers/srv_docs/headers", json={"headers": {"X-Key": "k"}})
    assert api.delete("/api/mcp-servers/srv_docs").status_code == 200
    assert storage.get_resource("mcp_server_secrets", "srv_docs") is None
    assert api.get("/api/mcp-servers/srv_docs/headers").status_code == 404


def test_discover_lists_tools_and_sends_stored_headers(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = _FakeServer()
    _use(monkeypatch, fake)
    api.put("/api/mcp-servers/srv_docs/headers", json={"headers": {"Authorization": "Bearer k"}})

    response = api.post("/api/mcp-servers/srv_docs/discover")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "ok": True,
        "error": None,
        "tools": [
            {
                "name": "search_docs",
                "description": "Search the docs",
                "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}},
            }
        ],
    }
    assert fake.headers and all(h.get("authorization") == "Bearer k" for h in fake.headers)


def test_discover_reports_an_unreachable_server_as_a_result(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _use(monkeypatch, _FakeServer(status=401))
    body = api.post("/api/mcp-servers/srv_docs/discover").json()
    assert body["ok"] is False and "401" in body["error"]

    api.put("/api/mcp-servers/srv_docs", json={**SERVER, "transport": "sse"})
    body = api.post("/api/mcp-servers/srv_docs/discover").json()
    assert body == {"ok": False, "tools": [], "error": body["error"]}
    assert "unsupported MCP transport" in body["error"]
    assert api.post("/api/mcp-servers/nope/discover").status_code == 404


def test_discover_is_off_on_the_public_demo(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PUBLIC_DEMO_MODE", "1")
    response = api.post("/api/mcp-servers/srv_docs/discover")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "mcp_discovery_disabled"


def test_registry_tools_cant_shadow_builtins_or_half_bind_mcp(api: TestClient) -> None:
    builtin = api.post("/api/tools", json={"id": "calculator", "description": "Mine"})
    assert builtin.status_code == 422
    assert "built-in" in builtin.json()["detail"]
    half_bound = {"id": "t1", "description": "d", "mcp_server_id": "srv_docs"}
    half = api.post("/api/tools", json=half_bound)
    assert half.status_code == 422
