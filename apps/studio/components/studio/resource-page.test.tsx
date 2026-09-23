import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const clients = vi.hoisted(() => {
  const usages = [{ graph_id: "g1", graph_name: "Support flow", node_id: "n1", node_type: "prompt", field: "promptId", via: null }];

  function makeClient(items: unknown[]) {
    return {
      list: vi.fn(async () => items),
      create: vi.fn(async (item: unknown) => item),
      update: vi.fn(async (item: unknown) => item),
      delete: vi.fn(async () => ({ deleted: true })),
      usages: vi.fn(async () => usages),
      versions: { publish: vi.fn(async () => ({ created: true })), list: vi.fn(async () => []) },
    };
  }

  return {
    prompts: makeClient([{ id: "p_1", name: "Explain", body: "Explain {question}" }]),
    tools: makeClient([{ id: "tool_demo", description: "Demo tool", parameters_json: "{}", requires_approval: true, mcp_server_id: "m" }]),
    agents: makeClient([{ id: "a_1", name: "Support agent", description: "Helps", default_flow_id: "g1", optional_elements: [] }]),
    mcpServers: makeClient([{ id: "m_1", name: "Local MCP", url: "http://x", transport: "sse", enabled: false }]),
    llmProfiles: makeClient([{ id: "l_1", name: "Fast", model: "qwen", model_provider: "ollama" }]),
  };
});
vi.mock("@/lib/api-client", () => ({ client: clients }));

import { WorkbenchProvider } from "@/components/workbench/WorkbenchProvider";
import { agentKind, llmProfileKind, mcpKind, promptKind, toolKind } from "./resource-kinds";
import { ResourcePage } from "./resource-page";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const renderPage = (kind: Parameters<typeof ResourcePage>[0]["kind"]) =>
  render(
    <WorkbenchProvider>
      <ResourcePage kind={kind} />
    </WorkbenchProvider>,
  );

// studio-graph-workbench-redesign-plan.md, Wave 4b (STO-605): one
// config-driven page for every registry.
describe.each([
  { kind: promptKind, title: "Prompt Lab", card: "Edit prompt Explain", text: "Explain {question}" },
  { kind: toolKind, title: "Tool registry", card: "Edit tool tool_demo", text: "Approval" },
  { kind: agentKind, title: "Agents", card: "Edit agent Support agent", text: "Helps · default graph: g1" },
  { kind: mcpKind, title: "MCP servers", card: "Edit MCP server Local MCP", text: "Disabled" },
  { kind: llmProfileKind, title: "LLM profiles", card: "Edit LLM profile Fast", text: "ollama · qwen" },
])("ResourcePage($kind.id)", ({ kind, title, card, text }) => {
  it("renders the page copy and each item's card", async () => {
    renderPage(kind);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    const cardEl = await screen.findByRole("button", { name: card });
    expect(within(cardEl).getByText(text, { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: `New ${kind.noun}` })).toBeTruthy();
  });

  it("edits in the shared Overview / Usage / History editor", async () => {
    renderPage(kind);
    fireEvent.click(await screen.findByRole("button", { name: card }));
    const dialog = await screen.findByRole("dialog", { name: `Edit ${kind.noun}` });
    expect(within(dialog).getByRole("tab", { name: /Overview/ })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("tab", { name: /Usage/ }));
    expect((await within(dialog).findByRole("region", { name: "Used by" })).textContent).toContain("Support flow");
    expect(within(dialog).getByRole("tab", { name: /History/ })).toBeTruthy();
  });
});

describe("ResourcePage extras", () => {
  it("opens the ?id= resource on its requested tab", async () => {
    window.history.replaceState(null, "", "/prompts?id=p_1&tab=usage");
    renderPage(promptKind);
    const dialog = await screen.findByRole("dialog", { name: "Edit prompt" });
    expect(await within(dialog).findByRole("region", { name: "Used by" })).toBeTruthy();
  });

  it("warns before deleting a resource graphs still use", async () => {
    renderPage(promptKind);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Explain" }));
    expect(await screen.findByText(/Used by 1 node in 1 graph/)).toBeTruthy();
    expect(screen.getByText(/Remove "Explain" \(p_1\)\?/)).toBeTruthy();
  });

  it("creates with the New editor (Overview only)", async () => {
    renderPage(promptKind);
    fireEvent.click(await screen.findByRole("button", { name: "New prompt" }));
    const dialog = await screen.findByRole("dialog", { name: "New prompt" });
    expect(within(dialog).queryByRole("tab")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Greeter" } });
    fireEvent.change(within(dialog).getByLabelText("Body"), { target: { value: "Hi {name}" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(clients.prompts.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Greeter", body: "Hi {name}" })));
  });
});
