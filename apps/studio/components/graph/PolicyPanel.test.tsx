import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PolicyPanel } from "./PolicyPanel";

const { clientMock } = vi.hoisted(() => ({
  clientMock: {
    getEffectivePolicies: vi.fn(),
    getGraphPolicies: vi.fn(),
    saveGraphPolicies: vi.fn(),
    listPolicyExceptions: vi.fn(),
    updatePolicyException: vi.fn(),
    deletePolicyException: vi.fn(),
  },
}));

vi.mock("@/lib/api-client", () => ({ client: clientMock }));

const ruleInfo = {
  code: "POLICY_TOO_MANY_MODEL_NODES",
  category: "cost",
  title: "Too many model nodes",
  description: "LLM and tool-loop nodes over a limit.",
  gate: "compile",
  default_enforcement: "warn",
  params: [{ name: "max_model_nodes", label: "Maximum model nodes", type: "integer", default: 5, minimum: 1 }],
};
const effective = (enforcement: string, source: string, max = 5, paramSource = "default") => ({
  rule: ruleInfo,
  enforcement,
  enforcement_source: source,
  params: { max_model_nodes: max },
  param_sources: { max_model_nodes: paramSource },
});
const DAY = 24 * 60 * 60 * 1000;
const exception = (id: string, days: number) => ({
  id,
  graph_id: "g1",
  policy_code: "POLICY_TOO_MANY_MODEL_NODES",
  node_id: null,
  reason: "known",
  created_at: "2026-01-01T00:00:00Z",
  expires_at: new Date(Date.now() + days * DAY).toISOString(),
});

beforeEach(() => {
  Object.values(clientMock).forEach((fn) => fn.mockReset());
  clientMock.getEffectivePolicies.mockImplementation(async (graphId?: string) =>
    graphId ? [effective("block_publish", "workspace")] : [effective("block_publish", "workspace")],
  );
  clientMock.getGraphPolicies.mockResolvedValue({ rules: {} });
  clientMock.listPolicyExceptions.mockResolvedValue([exception("pexc_old", -2), exception("pexc_soon", 3)]);
  try {
    window.localStorage.clear();
  } catch {
    // collapse state just isn't persisted
  }
});

afterEach(cleanup);

describe("PolicyPanel", () => {
  it("shows inherited enforcement and saves an override, then re-validates", async () => {
    const onPoliciesChanged = vi.fn();
    clientMock.saveGraphPolicies.mockResolvedValue({ rules: {} });
    render(<PolicyPanel graphId="g1" onPoliciesChanged={onPoliciesChanged} />);

    const trigger = await screen.findByRole("combobox", { name: "Too many model nodes enforcement" });
    expect(trigger.textContent).toContain("Inherit (Block publish)");
    expect(screen.getByText(/Effective: Block publish · Workspace/)).toBeTruthy();

    clientMock.getEffectivePolicies.mockResolvedValue([effective("off", "graph")]);
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("option", { name: /^Off/ }));

    await waitFor(() =>
      expect(clientMock.saveGraphPolicies).toHaveBeenCalledWith("g1", {
        rules: { POLICY_TOO_MANY_MODEL_NODES: { params: {}, enforcement: "off" } },
      }),
    );
    await waitFor(() => expect(onPoliciesChanged).toHaveBeenCalled());
    expect(await screen.findByText(/Effective: Off · This graph/)).toBeTruthy();
  });

  it("lists exceptions expiring first and extends one by 30 days", async () => {
    clientMock.updatePolicyException.mockResolvedValue(exception("pexc_soon", 33));
    render(<PolicyPanel graphId="g1" />);

    const rows = await screen.findAllByTestId("policy-exception");
    expect(within(rows[0]).getByText("Expiring soon")).toBeTruthy();
    expect(within(rows[1]).getByText("Expired")).toBeTruthy();
    expect(within(rows[1]).getByRole("button", { name: /Extend .* by 30 days/ }).textContent).toBe("Renew 30 days");

    fireEvent.click(within(rows[0]).getByRole("button", { name: /Extend .* by 30 days/ }));
    await waitFor(() => expect(clientMock.updatePolicyException).toHaveBeenCalled());
    const [graphId, id, expiresAt] = clientMock.updatePolicyException.mock.calls[0];
    expect([graphId, id]).toEqual(["g1", "pexc_soon"]);
    const days = (Date.parse(expiresAt) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(32.9);
    expect(days).toBeLessThan(33.1);
  });

  it("revokes only after confirmation", async () => {
    clientMock.deletePolicyException.mockResolvedValue({ deleted: true });
    render(<PolicyPanel graphId="g1" />);
    const [first] = await screen.findAllByTestId("policy-exception");
    fireEvent.click(within(first).getByRole("button", { name: /Revoke/ }));
    expect(clientMock.deletePolicyException).not.toHaveBeenCalled();
    fireEvent.click(within(first).getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(clientMock.deletePolicyException).toHaveBeenCalledWith("g1", "pexc_soon"));
  });
});
