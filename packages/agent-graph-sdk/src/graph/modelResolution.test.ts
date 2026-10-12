import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveModelFor, summaryFor } from "./nodes";

type Case = {
  name: string;
  run_model: string | null;
  profile_model: string | null;
  node_model: string | null;
  expect: { requested_model: string | null; source: string };
};
const contract = JSON.parse(readFileSync(new URL("../../contract/model-resolution.json", import.meta.url), "utf8")) as {
  cases: Case[];
};

describe("effectiveModelFor", () => {
  it.each(contract.cases)("matches the cross-language contract: $name", (c) => {
    const effective = effectiveModelFor(
      c.node_model === null ? {} : { model: c.node_model },
      { provider: "groq", model: c.run_model ?? undefined },
      { bound: c.profile_model !== null, model: c.profile_model },
    );
    expect({ requested_model: effective.requestedModel, source: effective.source }).toEqual(c.expect);
    expect(effective.provider).toBe("groq");
  });

  it("uses the run's provider and ignores the node's own saved provider", () => {
    const effective = effectiveModelFor({ provider: "ollama", model: "m" }, { provider: "stub" });
    expect(effective).toEqual({ provider: "stub", requestedModel: "m", source: "pin" });
  });

  it("reports a bound profile of unknown model as source profile", () => {
    expect(effectiveModelFor({ model: "m" }, { provider: "stub" }, { bound: true })).toEqual({
      provider: "stub",
      requestedModel: null,
      source: "profile",
    });
  });
});

describe("summaryFor with a run selection", () => {
  const stub = { provider: "stub" };

  it("shows the run provider and the default model for the seeded placeholder pin", () => {
    // The state after a Stub run used to read "qwen2.5:3b via stub" with a saved provider.
    expect(summaryFor("llm", { model: "qwen2.5:3b" }, { runSelection: stub })).toBe("stub · default model");
  });

  it("marks a model the run supplies, and a model the node pins", () => {
    expect(summaryFor("llm", { model: "pin-m" }, { runSelection: { provider: "groq", model: "run-m" } })).toBe("groq · run-m (run)");
    expect(summaryFor("llm", { model: "pin-m" }, { runSelection: { provider: "groq" } })).toBe("groq · pin-m (pinned)");
  });

  it("names a bound profile, and the same line applies with or without a user label", () => {
    const resourceNames = { "llm_profiles:lp": "Fast" };
    expect(summaryFor("llm", { llmProfileId: "lp" }, { runSelection: stub, resourceNames })).toBe("stub · profile Fast");
    expect(summaryFor("llm", { llmProfileId: "lp" }, { runSelection: stub, resourceNames, hasUserLabel: true })).toBe("stub · profile Fast");
  });

  it("appends the iteration cap for tool_loop", () => {
    expect(summaryFor("tool_loop", { model: "pin-m", maxToolIterations: 3 }, { runSelection: { provider: "groq" } })).toBe(
      "groq · pin-m (pinned) · max 3 iterations",
    );
  });

  it("keeps the legacy line when no run selection is supplied", () => {
    expect(summaryFor("llm", { provider: "ollama", model: "qwen2.5:3b" })).toBe("via ollama");
  });
});
