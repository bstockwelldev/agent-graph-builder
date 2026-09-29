import { API_URL, expect, openGraph, test } from "../fixtures";

type ChatSession = { id: string; title: string; provider: string; messages: { role: string; content: string }[] };

test("chats about the open graph on Stub, and the session persists", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph("E2E chat");
  await openGraph(page, graph, "?panel=chat");
  await expect(page.getByText("No session open")).toBeVisible();

  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.getByRole("combobox", { name: "Chat session" })).toHaveText(/Scratchpad/);
  await expect(page.getByText(`Context: ${graph.name}`)).toBeVisible();

  const question = `What does this graph do? ${Date.now()}`;
  await page.getByPlaceholder(/Message the model/).fill(question);
  await page.getByRole("button", { name: "Send" }).click();
  const log = page.getByRole("log");
  await expect(log.getByText(question)).toBeVisible();

  // The Stub model answers, and both turns are stored on the session.
  const stored = async () => {
    const sessions: ChatSession[] = await (await request.get(`${API_URL}/api/chat-sessions`)).json();
    return sessions.find((session) => session.messages.some((m) => m.content.includes(question)));
  };
  await expect.poll(async () => (await stored())?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  const session = (await stored())!;
  expect(session.provider).toBe("stub");
  const reply = session.messages[1].content;
  await expect(log.getByText(reply, { exact: true })).toBeVisible();

  // Reopening the panel and picking the session brings the conversation back.
  // Titles end in an id suffix, so the picker option is unambiguous.
  const title = session.title;
  await openGraph(page, graph, "?panel=chat");
  await page.getByRole("combobox", { name: "Chat session" }).click();
  await page.getByRole("option", { name: title, exact: true }).click();
  await expect(page.getByRole("log").getByText(question)).toBeVisible();
  await expect(page.getByRole("log").getByText(reply, { exact: true })).toBeVisible();
});

test("runs the open graph from chat and shows its steps", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E chat run");
  await openGraph(page, graph, "?panel=chat");
  await page.getByRole("button", { name: "New session" }).click();

  await page.getByRole("button", { name: "Run a graph" }).first().click();
  const form = page.getByRole("form", { name: "Run a graph" });
  await expect(form.getByRole("combobox", { name: "Graph" })).toContainText(graph.name);
  await form.getByLabel("question").fill("How does a database index work?");
  await form.getByRole("button", { name: "Run draft" }).click();

  const card = page.getByRole("group", { name: `Run of ${graph.name}` });
  await expect(card).toBeVisible();
  await expect(card.getByRole("img", { name: /^\d+ of \d+ nodes done$/ })).toHaveAccessibleName(/^(\d+) of \1 nodes done$/);
  await expect(card).toContainText(/A database index is a data structure/);
});

test("/run commands: a draft runs at once, a release waits for Confirm, and errors are reported", async ({ page, api, request }) => {
  const graph = await api.createDemoGraph("E2E chat command");
  expect((await request.post(`${API_URL}/api/graphs/${graph.id}/releases`, { data: {} })).ok()).toBe(true);
  await openGraph(page, graph, "?panel=chat");
  await page.getByRole("button", { name: "New session" }).click();
  const box = page.getByPlaceholder(/Message the model/);
  const card = page.getByRole("group", { name: `Run of ${graph.name}` });
  const done = card.getByRole("img", { name: /^\d+ of \d+ nodes done$/ });

  // Draft: runs straight away with the rest of the line as the input.
  await box.fill(`/run ${graph.id} How does a database index work?`);
  await box.press("Enter");
  await expect(card).toHaveCount(1);
  await expect(done.first()).toHaveAccessibleName(/^(\d+) of \1 nodes done$/);
  await expect(card.first()).toContainText(/A database index is a data structure/);

  // Release: nothing runs until the confirm card is accepted.
  await box.fill(`/run ${graph.id}@latest What is a B-tree?`);
  await box.press("Enter");
  const confirm = page.getByRole("alertdialog", { name: `Confirm run of ${graph.name}` });
  await expect(confirm).toBeVisible();
  await expect(card).toHaveCount(1);
  await confirm.getByRole("button", { name: /Run/ }).click();
  await expect(confirm).toBeHidden();
  await expect(card).toHaveCount(2);
  await expect(done.nth(1)).toHaveAccessibleName(/^(\d+) of \1 nodes done$/);

  // Unknown graph and bare /run explain themselves instead of messaging the model.
  await box.fill("/run no-such-graph-e2e hello");
  await box.press("Enter");
  await expect(page.getByText('No graph named "no-such-graph-e2e".')).toBeVisible();
  await box.fill("/run");
  await box.press("Enter");
  await expect(page.getByText(/^Usage: \/run <graph>/)).toBeVisible();
});

test("a plain-text run request is proposed, and Cancel discards it", async ({ page, api }) => {
  const graph = await api.createDemoGraph("E2E chat intent");
  await openGraph(page, graph, "?panel=chat");
  await page.getByRole("button", { name: "New session" }).click();
  const box = page.getByPlaceholder(/Message the model/);

  await box.fill(`please run ${graph.id}`);
  await box.press("Enter");
  const confirm = page.getByRole("alertdialog", { name: `Confirm run of ${graph.name}` });
  await expect(confirm).toContainText(/Proposed from your message/);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("group", { name: `Run of ${graph.name}` })).toHaveCount(0);
});
