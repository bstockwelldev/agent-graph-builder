import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetClientMock } from "@/lib/mockClient";

import PoliciesPage from "./page";

const { clientMock } = vi.hoisted(() => ({
  clientMock: {
    policies: {
      effective: vi.fn(),
      workspace: { get: vi.fn(), save: vi.fn() },
      exceptions: { list: vi.fn(), update: vi.fn(), delete: vi.fn() },
    },
    graphs: { list: vi.fn() },
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
  clientMock.graphs.list.mockResolvedValue([{ id: "g1", name: "Support flow" }]);
});

afterEach(cleanup);

describe("/policies", () => {
  it("groups rules by category and commits a threshold on blur", async () => {
    clientMock.policies.workspace.save.mockResolvedValue({ rules: {}, updated_at: "2026-09-23T00:00:00Z" });
    render(<PoliciesPage />);

    expect(await screen.findByText("Reliability")).toBeTruthy();
    expect(screen.getByText("Cost")).toBeTruthy();

    const input = screen.getByLabelText("Maximum model nodes") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(clientMock.policies.workspace.save).not.toHaveBeenCalled();
    expect(input.value).toBe("5");

    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(clientMock.policies.workspace.save).toHaveBeenCalledWith({
        rules: { POLICY_TOO_MANY_MODEL_NODES: { params: { max_model_nodes: 12 } } },
      }),
    );
  });

  it("filters exceptions and names their graph", async () => {
    render(<PoliciesPage />);
    const list = await screen.findByRole("list", { name: "Policy exceptions" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByRole("link", { name: "Support flow" }).getAttribute("href")).toBe("/graphs/g1");
    expect(screen.getByText(/0 expiring soon · 1 active · 1 expired/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Expired" }));
    const expired = screen.getByRole("list", { name: "Policy exceptions" });
    expect(within(expired).getByText(/expired 3 days ago/)).toBeTruthy();
    expect(within(expired).getByRole("button", { name: /Extend/ }).textContent).toBe("Renew 30 days");

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(within(screen.getByRole("list", { name: "Policy exceptions" })).getAllByRole("listitem")).toHaveLength(2);
  });
});
