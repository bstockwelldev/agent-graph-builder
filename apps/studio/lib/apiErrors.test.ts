import { describe, expect, it } from "vitest";
import { AgentGraphApiError, AgentGraphNetworkError } from "@bstockwelldev/agent-graph-sdk";

import { blockingDiagnostics, errorDetail, isReadOnlyGraphError } from "./apiErrors";

// SDK 1/7 (STO-614): user-facing error text from typed SDK errors.

const apiError = (status: number, body: unknown) =>
  new AgentGraphApiError({ status, method: "POST", path: "/api/x", url: "/api/x", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("errorDetail", () => {
  it("shows the FastAPI detail string", () => {
    expect(errorDetail(apiError(503, { detail: "No embedding provider" }))).toBe("No embedding provider");
  });

  it("appends the first blocking diagnostic of a blocked payload", () => {
    const error = apiError(422, {
      detail: {
        message: "release blocked by diagnostics",
        diagnostics: [
          { severity: "warning", code: "W", message: "just a warning", blocking: false },
          { severity: "error", code: "RELEASE_SUBGRAPH_UNPUBLISHED", message: "Publish 'Answer branch' first.", blocking: true },
          { severity: "error", code: "X", message: "another", blocking: true },
        ],
      },
    });
    expect(errorDetail(error)).toBe("release blocked by diagnostics: Publish 'Answer branch' first. (+1 more)");
    expect(blockingDiagnostics(error).map((d) => d.code)).toEqual(["RELEASE_SUBGRAPH_UNPUBLISHED", "X"]);
  });

  it("joins FastAPI validation messages and falls back to raw bodies", () => {
    expect(errorDetail(apiError(422, { detail: [{ msg: "field required" }, { msg: "bad id" }] }))).toBe("field required; bad id");
    expect(errorDetail(apiError(502, "Bad Gateway"))).toBe("Bad Gateway");
  });

  it("handles network errors and non-Error values", () => {
    const network = new AgentGraphNetworkError({ method: "GET", path: "/api/graphs", cause: new TypeError("fetch failed") });
    expect(errorDetail(network)).toBe("GET /api/graphs failed: fetch failed");
    expect(errorDetail("boom")).toBe("boom");
    expect(blockingDiagnostics(new Error("x"))).toEqual([]);
  });
});

describe("isReadOnlyGraphError", () => {
  it("matches the seeded demo's 403", () => {
    expect(isReadOnlyGraphError(apiError(403, { detail: { code: "graph_read_only", message: "read-only" } }))).toBe(true);
  });

  it("ignores other failures", () => {
    expect(isReadOnlyGraphError(apiError(403, { detail: { code: "live_provider_requires_api_key" } }))).toBe(false);
    expect(isReadOnlyGraphError(apiError(404, { detail: "graph not found" }))).toBe(false);
    expect(isReadOnlyGraphError(new Error("boom"))).toBe(false);
  });
});
