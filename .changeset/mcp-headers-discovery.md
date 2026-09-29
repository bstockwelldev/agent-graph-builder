---
"@bstockwelldev/agent-graph-sdk": minor
---

MCP servers: `mcpServers.headers.get/update` manage a server's request headers (write-only: only names come back; `null` keeps a stored value), and `mcpServers.discover(id)` connects with them and lists the server's tools (`McpDiscovery`, `McpRemoteTool`). Tool writes now reject a built-in tool's id and a half MCP binding (server without tool name, or the reverse) with 422.
