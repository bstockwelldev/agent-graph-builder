import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
Element.prototype.scrollIntoView ??= () => {};

const api = vi.hoisted(() => {
  const session = { id: "chat_1", title: "Scratch", provider: "stub", model: "stub", messages: [] as unknown[], created_at: "x", updated_at: "x" };
  return {
    session,
    client: {
      chatSessions: {
        list: vi.fn(async () => [session]),
        get: vi.fn(async () => session),
        update: vi.fn(async (s: unknown) => s),
        create: vi.fn(),
      },
      listGraphs: vi.fn(async () => [
        { id: "demo", name: "Support flow", entry_node_id: "i", edges: [], nodes: [{ id: "i", type: "input", position: { x: 0, y: 0 }, config: { variableName: "question" } }] },
      ]),
      listReleases: vi.fn(async () => [{ release_id: "rel_new", created_at: "2026-09-02", semantic_fingerprint: "a", document_fingerprint: "b" }]),
      startRun: vi.fn(async () => ({ run_id: "run_d", graph_id: "demo", status: "queued" })),
      startReleaseRun: vi.fn(async () => ({ run_id: "run_r", graph_id: "demo", status: "queued" })),
      getRun: vi.fn(async (id: string) => ({ run_id: id, graph_id: "demo", status: "succeeded", provider: "stub", result: "ok" })),
      getRunNodeTraces: vi.fn(async () => []),
      sendChatMessage: vi.fn(async () => session),
      listProviderModels: vi.fn(async () => ({ models: [], message: "" })),
    },
  };
});
vi.mock("@/lib/api-client", () => ({ client: api.client, waitForRun: vi.fn(() => new Promise(() => undefined)) }));

import { WorkbenchProvider, useWorkbench } from "@/components/workbench/WorkbenchProvider";
import { ChatPanel } from "./ChatPanel";

function OpenSession() {
  const workbench = useWorkbench();
  useEffect(() => workbench.open("chat", { chatSessionId: "chat_1" }), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

async function renderChat() {
  render(
    <WorkbenchProvider>
      <OpenSession />
      <ChatPanel />
    </WorkbenchProvider>,
  );
  return screen.findByPlaceholderText("Message the model, or /run <graph> …");
}

function send(box: HTMLElement, text: string) {
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}

beforeEach(() => {
  api.session.messages = [];
  vi.clearAllMocks();
});
afterEach(() => cleanup());

// studio-ux-gap-remediation-plan.md §4 (STO-600).
describe("ChatPanel graph runs", () => {
  it("/run on a draft starts at once via the run API and records a run card", async () => {
    const box = await renderChat();
    send(box, "/run Support flow How does TCP work?");
    await vi.waitFor(() => expect(api.client.startRun).toHaveBeenCalledWith("demo", { question: "How does TCP work?" }, "stub", "stub"));
    await vi.waitFor(() => expect(api.client.chatSessions.update).toHaveBeenCalled());
    const saved = api.client.chatSessions.update.mock.calls[0][0] as { messages: { role: string; content: string; run?: unknown }[] };
    expect(saved.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(saved.messages[1].run).toMatchObject({ run_id: "run_d", source: "draft", graph_name: "Support flow" });
    expect(await screen.findByRole("group", { name: "Run of Support flow" })).toBeTruthy();
    expect(api.client.sendChatMessage).not.toHaveBeenCalled();
  });

  it("a release run waits for an explicit confirm", async () => {
    const box = await renderChat();
    send(box, "/run demo@latest Hi");
    const confirm = await screen.findByRole("alertdialog", { name: "Confirm run of Support flow" });
    expect(api.client.startReleaseRun).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: /Run/ }));
    await vi.waitFor(() => expect(api.client.startReleaseRun).toHaveBeenCalledWith("rel_new", { question: "Hi" }, "stub", "stub"));
  });

  it("a plain-text request is only proposed, and Cancel discards it", async () => {
    const box = await renderChat();
    send(box, "please run the support flow");
    const confirm = await screen.findByRole("alertdialog", { name: "Confirm run of Support flow" });
    expect(within(confirm).getByText(/Proposed from your message/)).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.client.startRun).not.toHaveBeenCalled();
  });

  it("ordinary messages still go to the model", async () => {
    api.client.sendChatMessage.mockResolvedValueOnce({ ...api.session, messages: [] });
    const box = await renderChat();
    send(box, "run a marathon for me");
    await vi.waitFor(() => expect(api.client.sendChatMessage).toHaveBeenCalled());
    expect(api.client.startRun).not.toHaveBeenCalled();
  });
});
