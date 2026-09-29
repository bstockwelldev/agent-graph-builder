import { API_URL, expect, runOnStub, test, type GraphJson } from "../fixtures";

// resource-forms-consistency-plan.md, slice 3: MCP servers with write-only
// request headers, "Test connection" discovery, one-click registry tools,
// MCP-sourced tools, and a graph run through one. The fake MCP server
// (scripts/fake-mcp.mjs, :8124) wants `x-api-key: e2e-key`.
const FAKE_MCP_URL = "http://127.0.0.1:8124/mcp";

test("an MCP server keeps its headers secret, discovers tools, and a graph runs one", async ({ page, api, request }) => {
  const stamp = Date.now();
  const name = `E2E MCP ${stamp}`;
  await page.goto("/mcp");
  await page.getByRole("button", { name: /New MCP server/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "New MCP server" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("URL").fill(FAKE_MCP_URL);

  // Only HTTP runs; the other transports are listed but can't be picked.
  await dialog.getByRole("combobox", { name: "Transport" }).click();
  await expect(page.getByRole("option", { name: "SSE (not yet)" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  await dialog.getByRole("button", { name: "Add header" }).click();
  await dialog.getByLabel("Header 1 name").fill("X-Api-Key");
  await expect(dialog.getByText("To save: Add a value for header X-Api-Key.")).toBeVisible();
  await dialog.getByLabel("Header X-Api-Key value").fill("e2e-key");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const servers: { id: string; name: string }[] = await (await request.get(`${API_URL}/api/mcp-servers`)).json();
  const server = servers.find((entry) => entry.name === name)!;
  expect((await (await request.get(`${API_URL}/api/mcp-servers/${server.id}/headers`)).json()).names).toEqual(["X-Api-Key"]);
  expect(await (await request.get(`${API_URL}/api/mcp-servers/${server.id}`)).text()).not.toContain("e2e-key");

  // Reopened, the stored value stays hidden; Test connection uses it.
  await page.getByRole("button", { name: `Edit MCP server ${name}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit MCP server" });
  await expect(edit.getByLabel("Header X-Api-Key value")).toHaveValue("");
  await expect(edit.getByLabel("Header X-Api-Key value")).toHaveAttribute("placeholder", "Stored; type to replace");
  await edit.getByRole("button", { name: "Test connection" }).click();
  const found = edit.getByRole("status");
  await expect(found).toContainText("Connected · 1 tool");
  await found.getByRole("button", { name: "Add order_status to the tool registry" }).click();
  const toolId = `${server.id}.order_status`;
  await expect(found.getByText(toolId)).toBeVisible();
  const tool = await (await request.get(`${API_URL}/api/tools/${toolId}`)).json();
  expect(tool).toMatchObject({ mcp_server_id: server.id, mcp_tool_name: "order_status" });
  expect(JSON.parse(tool.parameters_json)).toMatchObject({ required: ["question"] });
  await edit.getByRole("button", { name: "Cancel" }).click();

  // A graph whose tool node calls the registry tool runs through the server.
  const graph: GraphJson = await api.createDemoGraph(`E2E MCP run ${stamp}`);
  graph.nodes = graph.nodes.map((node) => (node.id === "tool_lookup" ? { ...node, config: { ...node.config, toolName: toolId } } : node));
  await api.updateGraph(graph);
  const run = await api.getRun(await runOnStub(page, graph));
  expect(run.status).toBe("succeeded");
  expect(JSON.stringify(run.result)).toContain("shipped");
});

test("a tool sourced from an MCP server picks the server's tool and its schema", async ({ page, request }) => {
  const stamp = Date.now();
  const serverId = `e2e_mcp_${stamp}`;
  expect((await request.post(`${API_URL}/api/mcp-servers`, { data: { id: serverId, name: `Orders ${stamp}`, url: FAKE_MCP_URL } })).ok()).toBe(true);
  expect((await request.put(`${API_URL}/api/mcp-servers/${serverId}/headers`, { data: { headers: { "X-Api-Key": "e2e-key" } } })).ok()).toBe(true);

  const toolName = `orders_${stamp}`;
  await page.goto("/tools");
  await page.getByRole("button", { name: /New tool/i }).first().click();
  const dialog = page.getByRole("dialog", { name: "New tool" });
  await dialog.getByLabel("Tool name").fill(toolName);
  await dialog.getByRole("radio", { name: "MCP server" }).click();
  await expect(dialog.getByText(/To save: .*Pick an MCP server\./)).toBeVisible();

  await dialog.getByRole("combobox", { name: "MCP server" }).click();
  await page.getByRole("option", { name: `Orders ${stamp}` }).click();
  await dialog.getByRole("combobox", { name: "Server tool" }).click();
  await page.getByRole("option", { name: "order_status" }).click();
  // Picking fills the description and the (read-only) parameters from the server.
  await expect(dialog.getByLabel("Description")).toHaveValue("Looks up an order's shipping status");
  const params = dialog.getByLabel("Parameters (from the server)");
  await expect(params).toHaveAttribute("readonly", "");
  await expect(params).toHaveValue(/"question"/);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const tool = await (await request.get(`${API_URL}/api/tools/${toolName}`)).json();
  expect(tool).toMatchObject({ mcp_server_id: serverId, mcp_tool_name: "order_status" });

  // Built-in tool names are taken.
  await page.getByRole("button", { name: /New tool/i }).first().click();
  const again = page.getByRole("dialog", { name: "New tool" });
  await again.getByLabel("Tool name").fill("calculator");
  await expect(again.getByText("That's a built-in tool; pick another name.")).toBeVisible();
  await expect(again.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("Test connection reports a server that refuses the request", async ({ page, request }) => {
  const serverId = `e2e_mcp_nokey_${Date.now()}`;
  const name = `No key ${serverId}`;
  expect((await request.post(`${API_URL}/api/mcp-servers`, { data: { id: serverId, name, url: FAKE_MCP_URL } })).ok()).toBe(true);
  await page.goto("/mcp");
  await page.getByRole("button", { name: `Edit MCP server ${name}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit MCP server" });
  await edit.getByRole("button", { name: "Test connection" }).click();
  await expect(edit.getByRole("alert")).toContainText(/Couldn't connect: .*401/);
});
