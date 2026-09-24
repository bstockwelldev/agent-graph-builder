import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentGraphClient } from "./client.js";
import { effectivePolicyRuleSchema, policySettingsSchema } from "./schemas.js";

// Configurable policies (STO-608, backend/app/policies.py).

const rule = {
  code: "POLICY_TOO_MANY_MODEL_NODES",
  category: "cost",
  title: "Too many model nodes",
  description: "…",
  gate: "compile",
  default_enforcement: "warn",
  params: [{ name: "max_model_nodes", label: "Maximum model nodes", type: "integer", default: 5, minimum: 1 }],
};

describe("policy schemas", () => {
  it("parses an effective rule with sources", () => {
    const parsed = effectivePolicyRuleSchema.parse({
      rule,
      enforcement: "block_publish",
      enforcement_source: "workspace",
      params: { max_model_nodes: 3 },
      param_sources: { max_model_nodes: "graph" },
    });
    expect(parsed.enforcement).toBe("block_publish");
    expect(parsed.params.max_model_nodes).toBe(3);
  });

  it("validates a settings document", () => {
    expect(policySettingsSchema.parse({ rules: {} })).toEqual({ rules: {} });
    expect(policySettingsSchema.safeParse({ rules: { X: { enforcement: "never" } } }).success).toBe(false);
  });
});

describe("policy client", () => {
  const baseUrl = "http://localhost:8000";
  let fetchMock: ReturnType<typeof vi.fn>;
  const json = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saveGraphPolicies PUTs only the rules", async () => {
    fetchMock.mockResolvedValueOnce(json({ rules: {}, updated_at: "t" }));
    await createAgentGraphClient({ baseUrl }).policies.graph.save("g1", { rules: { A: { enforcement: "off", params: {} } } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/graphs/g1/policies`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ rules: { A: { enforcement: "off", params: {} } } });
  });

  it("getEffectivePolicies picks the workspace or graph route", async () => {
    fetchMock.mockResolvedValue(json([]));
    const client = createAgentGraphClient({ baseUrl });
    await client.policies.effective();
    await client.policies.effective({ graphId: "g1" });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${baseUrl}/api/policies/effective`,
      `${baseUrl}/api/graphs/g1/policies/effective`,
    ]);
  });

  it("policies.exceptions.update PATCHes the expiry", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ id: "pexc_1", graph_id: "g1", policy_code: "P", created_at: "a", expires_at: "2099-01-01T00:00:00Z" }),
    );
    const result = await createAgentGraphClient({ baseUrl }).policies.exceptions.update("g1", "pexc_1", { expiresAt: "2099-01-01T00:00:00Z" });
    expect(result.expires_at).toBe("2099-01-01T00:00:00Z");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
  });
});
