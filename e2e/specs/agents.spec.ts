import { API_URL, expect, openGraph, test } from "../fixtures";

// Slice 6 (resource-forms-consistency-plan.md): an agent is a graph plus an
// LLM profile, instructions and a tool allow-list, runnable from the Run
// panel and from chat.
type Trace = { node_id: string; input: { systemPrompt?: string } | null };

test("creates an agent with pickers and runs it from its graph's Run panel", async ({ page, api, request }) => {
  const stamp = Date.now();
  const graph = await api.createDemoGraph(`E2E agent graph ${stamp}`);
  const name = `Terse helper ${stamp}`;

  await page.goto("/agents");
  await page.getByRole("button", { name: /New agent/i }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("combobox", { name: "Graph", exact: true }).click();
  await page.getByRole("option", { name: `E2E agent graph ${stamp}` }).click();
  await page.getByLabel("System instructions").fill("Answer in one sentence.");
  await page.getByRole("checkbox", { name: /lookup_topic/ }).check();
  await page.getByRole("button", { name: /^(Save|Create)/ }).last().click();
  await expect(page.getByText(name).first()).toBeVisible();

  const agents: { id: string; name: string; graph_id: string; tool_ids: string[] }[] = await (await request.get(`${API_URL}/api/agents`)).json();
  const agent = agents.find((entry) => entry.name === name)!;
  expect(agent).toMatchObject({ graph_id: graph.id, tool_ids: ["lookup_topic"] });

  // The card's Run link opens the graph with the agent preselected.
  await page.getByRole("link", { name: `Run ${name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/graphs/${graph.id}\\?.*agent=${agent.id}`));
  await expect(page.getByRole("combobox", { name: "Agent", exact: true })).toHaveValue(agent.id);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page).toHaveURL(/[?&]run=run_/);
  const runId = new URL(page.url()).searchParams.get("run")!;
  await expect.poll(async () => (await api.getRun(runId)).status).toBe("succeeded");

  const summary = await (await request.get(`${API_URL}/api/runs/${runId}`)).json();
  expect(summary.agent_id).toBe(agent.id);
  const traces: Trace[] = await (await request.get(`${API_URL}/api/runs/${runId}/nodes`)).json();
  const llm = traces.find((trace) => trace.input?.systemPrompt !== undefined)!;
  expect(llm.input!.systemPrompt).toMatch(/^Answer in one sentence\./);
});

test("an agent whose allow-list misses a graph tool is refused with a diagnostic", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph(`E2E agent refused ${Date.now()}`);
  const id = `agent_refused_${Date.now()}`;
  const created = await request.post(`${API_URL}/api/agents`, { data: { id, name: "No lookups", graph_id: graph.id, tool_ids: ["calculator"] } });
  expect(created.ok(), await created.text()).toBeTruthy();

  await openGraph(page, graph, `?panel=run&agent=${id}`);
  await expect(page.getByRole("combobox", { name: "Agent", exact: true })).toHaveValue(id);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/doesn't allow tool 'lookup_topic'/).first()).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]run=run_/);
});

test("/run @agent in chat runs as the agent", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph(`E2E agent chat ${Date.now()}`);
  const id = `agent_chat_${Date.now()}`;
  const created = await request.post(`${API_URL}/api/agents`, { data: { id, name: "Chat helper", graph_id: graph.id, system_instructions: "Be kind." } });
  expect(created.ok(), await created.text()).toBeTruthy();

  await openGraph(page, graph, "?panel=chat");
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByPlaceholder(/Message the model/).fill(`/run @${id} How does a database index work?`);
  await page.getByRole("button", { name: "Send" }).click();

  const card = page.getByRole("group", { name: `Run of ${graph.name}` });
  await expect(card).toContainText("Agent Chat helper");
  await expect(card).toContainText(/A database index is a data structure/);

  const runs: { run_id: string; agent_id: string | null }[] = await (await request.get(`${API_URL}/api/graphs/${graph.id}/runs`)).json();
  expect(runs.map((run) => run.agent_id)).toContain(id);
});
