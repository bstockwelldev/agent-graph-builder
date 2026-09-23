import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
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

import { ResourceBrowserPanel } from "./ResourceBrowserPanel";
import { WorkbenchProvider, useWorkbench } from "./WorkbenchProvider";
import { promptFormConfig } from "./resourceFormConfigs";

afterEach(() => cleanup());

const prompts = [
  { id: "p_other", name: "Other", body: "x" },
  { id: "p_explain", name: "Explain", body: "Explain {question}" },
];
const promptClient = {
  list: vi.fn(async () => prompts),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  usages: vi.fn(async () => [
    { graph_id: "g1", graph_name: "Support flow", node_id: "prompt_1", node_type: "prompt", field: "promptId", via: null },
  ]),
  versions: { publish: vi.fn(), list: vi.fn(async () => []) },
};

function OpenFromNode() {
  const workbench = useWorkbench();
  useEffect(() => workbench.open("prompts", { resourceId: "p_explain" }), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// studio-graph-workbench-redesign-plan.md, Wave 4a (STO-605): "Open" from a bound node.
describe("ResourceBrowserPanel", () => {
  it("opens the requested resource's editor and lists where it's used", async () => {
    render(
      <WorkbenchProvider>
        <OpenFromNode />
        <ResourceBrowserPanel resourceClient={promptClient as never} title="Prompts" routeHref="/prompts" {...promptFormConfig} />
      </WorkbenchProvider>,
    );
    expect(await screen.findByRole("dialog", { name: "Edit prompt" })).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Explain");
    const usedBy = await screen.findByRole("region", { name: "Used by" });
    expect(usedBy.textContent).toContain("Support flow");
    expect(usedBy.textContent).toContain("prompt_1 · prompt template");
    expect(promptClient.usages).toHaveBeenCalledWith("p_explain");
    fireEvent.click(screen.getByRole("button", { name: /Support flow/ }));
  });
});
