// A minimal MCP server over HTTP (JSON-RPC 2.0) for e2e (playwright.config.ts):
// the studio's MCP "Test connection", tool discovery and MCP-bound tool runs
// talk to it through the API. It answers initialize, tools/list and
// tools/call, and wants `x-api-key: e2e-key`, so specs also exercise the
// server's stored request headers.
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_MCP_PORT ?? 8124);
const HOST = process.env.FAKE_MCP_HOST ?? "127.0.0.1";
const API_KEY = "e2e-key";

const TOOLS = [
  {
    name: "order_status",
    description: "Looks up an order's shipping status",
    inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
  },
];

function result(id, value) {
  return JSON.stringify({ jsonrpc: "2.0", id, result: value });
}

createServer((request, response) => {
  if (request.method === "GET") {
    response.writeHead(200).end("ok");
    return;
  }
  if (request.headers["x-api-key"] !== API_KEY) {
    response.writeHead(401).end("missing or wrong x-api-key");
    return;
  }
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    let message;
    try {
      message = JSON.parse(body);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const json = (payload) => response.writeHead(200, { "content-type": "application/json" }).end(payload);
    switch (message.method) {
      case "initialize":
        return json(result(message.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake-mcp", version: "1" } }));
      case "notifications/initialized":
        return response.writeHead(202).end();
      case "tools/list":
        return json(result(message.id, { tools: TOOLS }));
      case "tools/call": {
        const question = message.params?.arguments?.question ?? "";
        return json(result(message.id, { content: [{ type: "text", text: `Order status for "${question}": shipped` }] }));
      }
      default:
        return json(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "method not found" } }));
    }
  });
}).listen(PORT, HOST, () => console.log(`fake MCP server on http://${HOST}:${PORT}/mcp`));
