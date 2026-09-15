"""Studio-consolidation Phase 3: MCP JSON-RPC HTTP client.

See docs/planning/features/studio-consolidation-plan.md.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.mcp.client import McpError, call_mcp_tool, list_mcp_tools, namespaced_tool_key
from app.resource_models import McpServerConfig


def _server(**overrides) -> McpServerConfig:
    defaults = {"id": "srv_1", "name": "Test MCP", "url": "https://mcp.example.com/rpc"}
    return McpServerConfig.model_validate({**defaults, **overrides})


def test_namespaced_tool_key() -> None:
    assert namespaced_tool_key("srv_1", "search") == "srv_1.search"


class _FakeMcpServer:
    """Records the JSON-RPC method sequence and answers a fixed script."""

    def __init__(self) -> None:
        self.methods: list[str] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.methods.append(body["method"])
        if body["method"] == "initialize":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {"protocolVersion": "2024-11-05"}})
        if body["method"] == "notifications/initialized":
            return httpx.Response(200)
        if body["method"] == "tools/list":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": 1, "result": {"tools": [{"name": "search", "description": "Search"}]}},
            )
        if body["method"] == "tools/call":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {"content": "search result"}})
        return httpx.Response(500)


@pytest.mark.asyncio
async def test_list_mcp_tools_performs_handshake_then_lists(monkeypatch) -> None:
    fake = _FakeMcpServer()

    class _MockAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(fake.handle)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("app.mcp.client.httpx.AsyncClient", _MockAsyncClient)

    tools = await list_mcp_tools(_server())

    assert fake.methods == ["initialize", "notifications/initialized", "tools/list"]
    assert tools == [{"name": "search", "description": "Search"}]


@pytest.mark.asyncio
async def test_call_mcp_tool_returns_result(monkeypatch) -> None:
    fake = _FakeMcpServer()

    class _MockAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(fake.handle)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("app.mcp.client.httpx.AsyncClient", _MockAsyncClient)

    result = await call_mcp_tool(_server(), "search", {"query": "hi"})

    assert fake.methods == ["initialize", "notifications/initialized", "tools/call"]
    assert result == {"content": "search result"}


@pytest.mark.asyncio
async def test_call_mcp_tool_degrades_on_jsonrpc_error(monkeypatch) -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["method"] == "tools/call":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32601, "message": "not found"}})
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {}})

    class _MockAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handle)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("app.mcp.client.httpx.AsyncClient", _MockAsyncClient)

    result = await call_mcp_tool(_server(), "missing_tool", {})

    assert result["mcp"] == "srv_1"
    assert "not found" in result["error"]


@pytest.mark.asyncio
async def test_call_mcp_tool_degrades_on_http_error(monkeypatch) -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    class _MockAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handle)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("app.mcp.client.httpx.AsyncClient", _MockAsyncClient)

    result = await call_mcp_tool(_server(), "search", {})

    assert result["mcp"] == "srv_1"
    assert "error" in result


@pytest.mark.asyncio
async def test_unsupported_transport_raises_for_list_but_degrades_for_call() -> None:
    sse_server = _server(transport="sse")

    with pytest.raises(McpError, match="unsupported MCP transport"):
        await list_mcp_tools(sse_server)

    result = await call_mcp_tool(sse_server, "search", {})
    assert "unsupported MCP transport" in result["error"]
