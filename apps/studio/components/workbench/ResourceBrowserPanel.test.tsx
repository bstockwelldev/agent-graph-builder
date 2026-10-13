import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

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

const graphsClient = vi.hoisted(() => ({
  summaries: { list: vi.fn(async () => [{ id: "g1", name: "Support flow", node_count: 1, edge_count: 0, input_variables: [], subgraph_ids: [] }]) },
  resources: vi.fn(async () => ({ graph_id: "g1", ids: { prompts: [], tools: ["tool_demo"] } })),
}));
vi.mock("@/lib/api-client", () => ({ client: { graphs: graphsClient } }));

// Base UI's Select popup never settles in jsdom (its floating-ui positioning
// loops), so the wiring is tested through a native <select> stand-in: the
// <option>s come from the real SelectItems, the change from the real onValueChange.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Context = React.createContext<{ value?: string; onValueChange?: (value: string) => void }>({});
  return {
    Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (value: string) => void; children: React.ReactNode }) =>
      React.createElement(Context.Provider, { value: { value, onValueChange } }, children),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const { value, onValueChange } = React.useContext(Context);
      return React.createElement("select", { "aria-label": "Select", value, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(event.target.value) }, children);
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => React.createElement("option", { value }, children),
  };
});

import { ResourceBrowserPanel } from "./ResourceBrowserPanel";
import { WorkbenchDrawer } from "./WorkbenchDrawer";
import { WorkbenchProvider, useWorkbench } from "./WorkbenchProvider";
import type { WorkbenchPanelId } from "./panels";
import { RESOURCE_KINDS, agentKind, datasetKind, evalSuiteKind, promptKind, toolKind } from "@/components/studio/resource-kinds";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

const usages = [{ graph_id: "g1", graph_name: "Support flow", node_id: "prompt_1", node_type: "prompt", field: "promptId", via: null }];
const makeClient = (items: unknown[]) => ({
  list: vi.fn(async () => items),
  create: vi.fn(async (item: unknown) => item),
  update: vi.fn(async (item: unknown) => item),
  delete: vi.fn(async () => ({ deleted: true })),
  usages: vi.fn(async () => usages),
  versions: { publish: vi.fn(), list: vi.fn(async () => []) },
});

const prompts = [
  { id: "p_other", name: "Other", body: "x" },
  { id: "p_explain", name: "Explain", body: "Explain {question}" },
];
const promptClient = makeClient(prompts);

function OpenWith({ panel, context }: { panel: WorkbenchPanelId; context?: unknown }) {
  const workbench = useWorkbench();
  useEffect(() => workbench.open(panel, context), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function renderPanel(kind: Parameters<typeof ResourceBrowserPanel>[0]["kind"], context?: unknown) {
  return render(
    <WorkbenchProvider>
      <OpenWith panel={kind.panelId} context={context} />
      <ResourceBrowserPanel kind={kind} />
    </WorkbenchProvider>,
  );
}

// studio-graph-workbench-redesign-plan.md, Wave 4a (STO-605): "Open" from a bound node.
describe("ResourceBrowserPanel", () => {
  it("opens the requested resource's editor and lists where it's used", async () => {
    renderPanel({ ...promptKind, client: promptClient as never }, { resourceId: "p_explain" });
    expect(await screen.findByRole("dialog", { name: "Edit prompt" })).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Explain");
    // The full pages are gone (canvas-first landing plan, Phase 3): the panel is the only view.
    expect(screen.queryByRole("link", { name: /Open full page/, hidden: true })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Usage/ }));
    const usedBy = await screen.findByRole("region", { name: "Used by" });
    expect(usedBy.textContent).toContain("Support flow");
    expect(usedBy.textContent).toContain("prompt_1 · prompt template");
    expect(promptClient.usages).toHaveBeenCalledWith("p_explain");
    fireEvent.click(screen.getByRole("button", { name: /Support flow/ }));
  });
});

// Canvas-first landing plan, Phase 2 (§4 item 1): parity with ResourcePage
// (cases ported from resource-page.test.tsx).
describe("ResourceBrowserPanel parity with the resource pages", () => {
  it("opens the ?id= resource on its requested tab", async () => {
    renderPanel({ ...promptKind, client: makeClient(prompts) as never }, { resourceId: "p_explain", tab: "usage" });
    const dialog = await screen.findByRole("dialog", { name: "Edit prompt" });
    expect(await within(dialog).findByRole("region", { name: "Used by" })).toBeTruthy();
  });

  it("opens a deep-linked resource that the remembered scope would hide", async () => {
    window.localStorage.setItem("agb:scope-graph", "g1");
    renderPanel({ ...promptKind, client: makeClient(prompts) as never }, { resourceId: "p_explain" });
    expect(await screen.findByRole("dialog", { name: "Edit prompt" })).toBeTruthy();
  });

  it("warns before deleting a resource graphs still use", async () => {
    renderPanel({ ...promptKind, client: makeClient(prompts) as never });
    fireEvent.click(await screen.findByRole("button", { name: "Delete Explain" }));
    expect(await screen.findByText(/Used by 1 node in 1 graph/)).toBeTruthy();
  });

  it("creates with the New editor (Overview only)", async () => {
    const client = makeClient(prompts);
    renderPanel({ ...promptKind, client: client as never });
    const newButton = await screen.findByRole("button", { name: "New" });
    await vi.waitFor(() => expect((newButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(newButton);
    const dialog = await screen.findByRole("dialog", { name: "New prompt" });
    expect(within(dialog).queryByRole("tab")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Greeter" } });
    fireEvent.change(within(dialog).getByLabelText("Body"), { target: { value: "Hi {name}" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(client.create).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringMatching(/^greeter_[0-9a-f]{4}$/), name: "Greeter", body: "Hi {name}" })),
    );
  });

  it("narrows the list to the graph in scope, and remembers it", async () => {
    const toolClient = makeClient([
      { id: "tool_demo", description: "Demo tool", parameters_json: "{}", requires_approval: true, mcp_server_id: "m" },
      { id: "tool_other", description: "Other tool", parameters_json: "{}", requires_approval: false, mcp_server_id: null },
    ]);
    window.history.replaceState(null, "", "/?graph=g1");
    renderPanel({ ...toolKind, client: toolClient as never });
    expect(await screen.findByText(/1 of 2 tools used by Support flow\./)).toBeTruthy();
    expect(graphsClient.resources).toHaveBeenCalledWith("g1");
    expect(window.localStorage.getItem("agb:scope-graph")).toBe("g1");
    expect(screen.queryByRole("button", { name: "Delete tool_other" })).toBeNull();
    cleanup();

    // Another kind picks up the remembered scope, and says when nothing is used.
    window.history.replaceState(null, "", "/");
    renderPanel({ ...promptKind, client: makeClient(prompts) as never });
    expect(await screen.findByText("Support flow uses no prompts.")).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("graph")).toBe("g1");
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(await screen.findByRole("button", { name: "Delete Explain" })).toBeTruthy();
    expect(window.location.search).toBe("");
  });

  it("keeps each registry's links: run an agent, open a dataset in the routing lab, run a suite", async () => {
    const agents = [{ id: "a_1", name: "Support agent", description: "", graph_id: "g1", tool_ids: [] }];
    renderPanel({ ...agentKind, client: makeClient(agents) as never });
    expect((await screen.findByRole("link", { name: "Run Support agent" })).getAttribute("href")).toBe("/graphs/g1?panel=run&agent=a_1");
    cleanup();

    const datasets = [{ id: "ds_1", name: "Triage set", graph_id: "g1", fixtures: [{ input: { q: "a" } }], source: "manual", source_run_ids: [] }];
    renderPanel({ ...datasetKind, client: makeClient(datasets) as never });
    expect((await screen.findByRole("link", { name: "Open Triage set in routing lab" })).getAttribute("href")).toContain("panel=routingLab&dataset=ds_1");
    cleanup();

    const suites = [{ id: "ev_1", name: "Regression", graph_id: "g1", dataset_id: "ds_1" }];
    renderPanel({ ...evalSuiteKind, client: makeClient(suites) as never });
    expect((await screen.findByRole("link", { name: "Run Regression" })).getAttribute("href")).toBe("/graphs/g1?panel=evals&suite=ev_1");
  });
});

function ActivePanel() {
  return <output data-testid="active">{useWorkbench().activePanel}</output>;
}

// Canvas-first landing plan, Phase 2 (§4 item 1): one panel replaces the /resources hub.
describe("resource kind switcher", () => {
  it("lists all 8 kinds and opens the chosen kind's panel", async () => {
    render(
      <WorkbenchProvider>
        <OpenWith panel="prompts" />
        <ActivePanel />
        <WorkbenchDrawer panelId="prompts" side="right" mode="docked-reserve">
          <ResourceBrowserPanel kind={{ ...promptKind, client: makeClient(prompts) as never }} />
        </WorkbenchDrawer>
      </WorkbenchProvider>,
    );
    // The first select is the kind switcher; the Scope select follows it.
    const [switcher] = await screen.findAllByRole("combobox");
    expect((switcher as HTMLSelectElement).value).toBe("prompts");
    const options = within(switcher).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(RESOURCE_KINDS.map((kind) => kind.panelTitle));
    expect(options).toHaveLength(8);
    fireEvent.change(switcher, { target: { value: "datasets" } });
    await vi.waitFor(() => expect(screen.getByTestId("active").textContent).toBe("datasets"));
  });
});
