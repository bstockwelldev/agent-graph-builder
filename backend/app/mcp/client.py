"""Hand-rolled JSON-RPC 2.0 client for MCP (Model Context Protocol) HTTP
servers (studio-consolidation Phase 3, see
docs/planning/features/studio-consolidation-plan.md). Ported from
micro-ui-agent-builder's `lib/server/mcp-jsonrpc-http.ts` — no
`@modelcontextprotocol/sdk` dependency, stateless per request (no session
headers), protocol version `"2024-11-05"`.

Only the `http` transport is implemented, matching the scope of the ported
file; `sse`/`stdio` `McpServerConfig` entries degrade with a clear error
rather than being silently ignored.
"""

from __future__ import annotations

from typing import Any

import httpx

from ..resource_models import McpServerConfig

_PROTOCOL_VERSION = "2024-11-05"
_CLIENT_INFO = {"name": "agent-graph-builder", "version": "0.2.0"}
_TIMEOUT = 25.0


class McpError(RuntimeError):
    """Raised for a JSON-RPC error response or an unsupported transport."""


def namespaced_tool_key(server_id: str, remote_tool_name: str) -> str:
    """Canonical tool identity: `serverId.toolName` (matches MUI's
    `mcp-bridge.ts` `namespaceMcpToolKey`)."""
    return f"{server_id}.{remote_tool_name}"


async def _rpc(
    client: httpx.AsyncClient,
    url: str,
    method: str,
    params: dict[str, Any] | None = None,
    *,
    notification: bool = False,
) -> Any:
    body: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        body["params"] = params
    if not notification:
        body["id"] = 1
    response = await client.post(url, json=body, headers={"content-type": "application/json"})
    response.raise_for_status()
    if notification or not response.content:
        return None
    payload = response.json()
    error = payload.get("error")
    if error is not None:
        raise McpError(f"MCP error {error.get('code')}: {error.get('message')}")
    return payload.get("result")


async def _handshake(client: httpx.AsyncClient, url: str) -> None:
    await _rpc(
        client,
        url,
        "initialize",
        {"protocolVersion": _PROTOCOL_VERSION, "capabilities": {}, "clientInfo": _CLIENT_INFO},
    )
    await _rpc(client, url, "notifications/initialized", notification=True)


def _require_http_transport(server: McpServerConfig) -> None:
    if server.transport != "http":
        raise McpError(f"unsupported MCP transport {server.transport!r}; only 'http' is implemented")


async def list_mcp_tools(server: McpServerConfig) -> list[dict[str, Any]]:
    """Returns `server`'s advertised tools (raw MCP tool descriptors)."""
    _require_http_transport(server)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        await _handshake(client, server.url)
        result = await _rpc(client, server.url, "tools/list")
    return (result or {}).get("tools") or []


async def call_mcp_tool(server: McpServerConfig, tool_name: str, arguments: dict[str, Any]) -> Any:
    """Calls `tool_name` on `server`. Degrades to `{mcp, error}` rather
    than raising on failure, matching MUI's `mcp-bridge.ts` convention of
    returning a tool error payload instead of throwing (so one bad MCP
    server doesn't necessarily fail the whole run)."""
    try:
        _require_http_transport(server)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            await _handshake(client, server.url)
            return await _rpc(client, server.url, "tools/call", {"name": tool_name, "arguments": arguments})
    except (httpx.HTTPError, McpError) as exc:
        return {"mcp": server.id, "error": str(exc)}
