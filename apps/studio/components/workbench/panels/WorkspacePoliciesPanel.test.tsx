import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetClientMock } from "@/lib/mockClient";

import { WorkspacePoliciesPanel } from "./WorkspacePoliciesPanel";

const { clientMock } = vi.hoisted(() => ({
  clientMock: {
    policies: {
      effective: vi.fn(),
      workspace: { get: vi.fn(), save: vi.fn() },
      graph: { get: vi.fn(), save: vi.fn() },
      exceptions: { list: vi.fn(), update: vi.fn(), delete: vi.fn() },
    },
    graphs: { summaries: { list: vi.fn() } },
  },
}));

vi.mock("@/lib/api-client", () => ({ client: clientMock }));

const rule = (category: string, code: string, title: string, params: unknown[] = []) => ({
  rule: { code, category, title, description: `${title} description`, gate: "compile", default_enforcement: "warn", params },
  enforcement: "warn",
  enforcement_source: "default",
  params: params.length ? { max_model_nodes: 5 } : {},
  param_sources: params.length ? { max_model_nodes: "default" } : {},
});
const DAY = 24 * 60 * 60 * 1000;
const exception = (id: string, days: number) => ({
  id,
  graph_id: "g1",
  policy_code: "POLICY_LLM_MODEL_NOT_PINNED",
  node_id: "llm_1",
  reason: null,
  created_at: "2026-01-01T00:00:00Z",
  expires_at: new Date(Date.now() + days * DAY).toISOString(),
});

beforeEach(() => {
  resetClientMock(clientMock);
  clientMock.policies.effective.mockResolvedValue([
    rule("reliability", "POLICY_LLM_MODEL_NOT_PINNED", "LLM model not pinned"),
    rule("cost", "POLICY_TOO_MANY_MODEL_NODES", "Too many model nodes", [
      { name: "max_model_nodes", label: "Maximum model nodes", type: "integer", default: 5, minimum: 1 },
    ]),
  ]);
  clientMock.policies.workspace.get.mockResolvedValue({ rules: {}, updated_at: null });
  clientMock.policies.exceptions.list.mockResolvedValue([exception("pexc_live", 20), exception("pexc_dead", -3)]);
  clientMock.graphs.summaries.list.mockResolvedValue([{ id: "g1", name: "Support flow" }]);
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

// Canvas-first landing plan, Phase 2 (§4 item 3): the /policies body as a global panel.
describe("WorkspacePoliciesPanel", () => {
  it("renders the workspace defaults and exceptions, and saves an edit", async () => {
    clientMock.policies.workspace.save.mockResolvedValue({ rules: {}, updated_at: "2026-09-23T00:00:00Z" });
    render(<WorkspacePoliciesPanel />);

    expect(await screen.findByText("Reliability")).toBeTruthy();
    expect(screen.getByText("Cost")).toBeTruthy();
    const list = await screen.findByRole("list", { name: "Policy exceptions" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByRole("link", { name: "Support flow" }).getAttribute("href")).toBe("/graphs/g1");

    const input = screen.getByLabelText("Maximum model nodes") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(clientMock.policies.workspace.save).toHaveBeenCalledWith({
        rules: { POLICY_TOO_MANY_MODEL_NODES: { params: { max_model_nodes: 12 } } },
      }),
    );
  });

  it("shows a refused save as an alert (the public demo's read-only workspace policies)", async () => {
    clientMock.policies.workspace.save.mockRejectedValue(new Error("Workspace policies are read-only on the public demo. Override a rule on a graph."));
    render(<WorkspacePoliciesPanel />);
    const input = (await screen.findByLabelText("Maximum model nodes")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.blur(input);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Workspace policies are read-only on the public demo");
  });

  it("extends and revokes an exception", async () => {
    clientMock.policies.exceptions.update.mockResolvedValue({});
    clientMock.policies.exceptions.delete.mockResolvedValue({});
    render(<WorkspacePoliciesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /^Extend .* by 30 days$/ }));
    await waitFor(() => expect(clientMock.policies.exceptions.update).toHaveBeenCalledWith("g1", "pexc_live", { expiresAt: expect.any(String) }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(clientMock.policies.exceptions.delete).toHaveBeenCalledWith("g1", "pexc_live"));
  });
});
