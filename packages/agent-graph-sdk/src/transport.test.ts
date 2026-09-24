import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentGraphClient } from "./client.js";
import {
  AgentGraphApiError,
  AgentGraphNetworkError,
  AgentGraphResponseError,
  AgentGraphTimeoutError,
  errorText,
  isAgentGraphApiError,
} from "./errors.js";
import { graphDefinitionSchema } from "./schemas.js";
import { createTransport, path, query } from "./transport.js";

// SDK 1/7 (STO-614): transport options and typed errors. Every test injects
// `fetch` -- no globals are patched.

const graph = { id: "g 1/x", name: "G", entry_node_id: "n", nodes: [], edges: [] };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => vi.useRealTimers());

describe("requests", () => {
  it("sends JSON Content-Type only with a body, and merges client, dynamic and call headers", async () => {
    const fetch = vi.fn().mockImplementation(async () => json(graph));
    let token = "t1";
    const client = createAgentGraphClient({
      baseUrl: "http://api",
      fetch,
      headers: async () => ({ Authorization: `Bearer ${token}`, "X-App": "studio" }),
    });
    await client.getGraph("g1");
    token = "t2";
    await client.with({ headers: { "X-App": "cli", "X-Trace": "1" } }).saveGraph(graph as never);

    const [, getInit] = fetch.mock.calls[0] as [string, RequestInit];
    const getHeaders = new Headers(getInit.headers);
    expect(getHeaders.get("authorization")).toBe("Bearer t1");
    expect(getHeaders.has("content-type")).toBe(false);

    const [, putInit] = fetch.mock.calls[1] as [string, RequestInit];
    const putHeaders = new Headers(putInit.headers);
    expect(putHeaders.get("authorization")).toBe("Bearer t2");
    expect(putHeaders.get("content-type")).toBe("application/json");
    expect([putHeaders.get("x-app"), putHeaders.get("x-trace")]).toEqual(["cli", "1"]);
  });

  it("encodes every path segment", async () => {
    const fetch = vi.fn().mockResolvedValue(json(graph));
    await createAgentGraphClient({ baseUrl: "http://api", fetch }).getGraph("a b/c?d");
    expect(fetch.mock.calls[0][0]).toBe("http://api/api/graphs/a%20b%2Fc%3Fd");
    expect(path`/api/x/${"1/2"}/y/${3}`).toBe("/api/x/1%2F2/y/3");
    expect(query({ a: "x y", b: undefined, c: 0 })).toBe("?a=x+y&c=0");
    expect(query({})).toBe("");
  });
});

describe("typed errors", () => {
  it("exposes 422 diagnostics and the detail text", async () => {
    const diagnostics = [{ severity: "error", code: "RELEASE_SUBGRAPH_UNPUBLISHED", message: "Publish child first.", blocking: true }];
    const fetch = vi.fn().mockResolvedValue(json({ detail: { message: "publish blocked", diagnostics } }, 422));
    const error = await createAgentGraphClient({ fetch }).publishRelease("g1", {}).catch((e: unknown) => e);
    expect(isAgentGraphApiError(error)).toBe(true);
    const apiError = error as AgentGraphApiError;
    expect([apiError.status, apiError.method, apiError.path]).toEqual([422, "POST", "/api/graphs/g1/releases"]);
    expect(apiError.diagnostics?.[0].code).toBe("RELEASE_SUBGRAPH_UNPUBLISHED");
    expect(errorText(apiError)).toBe("publish blocked");
    expect(apiError.message).toBe("POST /api/graphs/g1/releases failed (422): publish blocked");
  });

  it("handles string details, top-level diagnostics and non-JSON bodies", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "graph not found" }, 404))
      .mockResolvedValueOnce(json({ diagnostics: [{ severity: "error", code: "X", message: "m", blocking: true }] }, 422))
      .mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 400 }));
    const client = createAgentGraphClient({ fetch, retry: false });
    const notFound = (await client.getGraph("x").catch((e: unknown) => e)) as AgentGraphApiError;
    expect([notFound.status, notFound.detail, errorText(notFound)]).toEqual([404, "graph not found", "graph not found"]);
    const blocked = (await client.getGraph("y").catch((e: unknown) => e)) as AgentGraphApiError;
    expect(blocked.diagnostics?.map((d) => d.code)).toEqual(["X"]);
    const html = (await client.getGraph("z").catch((e: unknown) => e)) as AgentGraphApiError;
    expect([html.detail, html.diagnostics]).toEqual(["<html>bad gateway</html>", undefined]);
  });

  it("rejects a schema mismatch with AgentGraphResponseError", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ nope: true }));
    const error = await createAgentGraphClient({ fetch }).getGraph("g").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentGraphResponseError);
    expect((error as AgentGraphResponseError).issues.length).toBeGreaterThan(0);
  });
});

describe("retries", () => {
  const fastRetry = { retries: 2, baseDelayMs: 1, maxDelayMs: 2 };

  it("retries an idempotent GET on 5xx and network errors, then succeeds", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "busy" }, 503))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(graph));
    const onResponse = vi.fn();
    const result = await createAgentGraphClient({ fetch, retry: fastRetry, onResponse }).getGraph("g");
    expect(result.name).toBe("G");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onResponse.mock.calls.map((c) => [c[0].attempt, c[0].status])).toEqual([
      [1, 503],
      [2, null],
      [3, 200],
    ]);
  });

  it("never retries a POST by default, and gives up after the retry budget", async () => {
    const post = vi.fn().mockResolvedValue(json({ detail: "busy" }, 503));
    await expect(createAgentGraphClient({ fetch: post, retry: fastRetry }).compileGraph("g")).rejects.toBeInstanceOf(AgentGraphApiError);
    expect(post).toHaveBeenCalledTimes(1);

    const down = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createAgentGraphClient({ fetch: down, retry: fastRetry }).getGraph("g")).rejects.toBeInstanceOf(AgentGraphNetworkError);
    expect(down).toHaveBeenCalledTimes(3);

    const once = vi.fn().mockResolvedValue(json({}, 500));
    await createAgentGraphClient({ fetch: once }).with({ retry: false }).getGraph("g").catch(() => undefined);
    expect(once).toHaveBeenCalledTimes(1);
  });

  it("honours Retry-After on 429", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(json({}, 429, { "Retry-After": "2" })).mockResolvedValueOnce(json(graph));
    const pending = createAgentGraphClient({ fetch, retry: { retries: 1, maxDelayMs: 10_000 } }).getGraph("g");
    await vi.advanceTimersByTimeAsync(1_900);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toMatchObject({ name: "G" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("cancellation and timeouts", () => {
  const hang = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        if (init.signal?.aborted) reject(init.signal.reason);
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );

  it("passes the caller's signal through client.with and rejects when it aborts", async () => {
    const controller = new AbortController();
    const pending = createAgentGraphClient({ fetch: hang as never }).with({ signal: controller.signal }).getGraph("g");
    await new Promise((resolve) => setTimeout(resolve, 5)); // let the request reach fetch
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect((hang.mock.calls.at(-1)![1] as RequestInit).signal?.aborted).toBe(true);

    // Aborted before the request is sent: fetch is never called.
    const calls = hang.mock.calls.length;
    const early = new AbortController();
    const skipped = createAgentGraphClient({ fetch: hang as never }).with({ signal: early.signal }).getGraph("g");
    early.abort();
    await expect(skipped).rejects.toMatchObject({ name: "AbortError" });
    expect(hang.mock.calls.length).toBe(calls);
  });

  it("times out with AgentGraphTimeoutError and doesn't retry an aborted request", async () => {
    const error = await createAgentGraphClient({ fetch: hang as never, timeoutMs: 20, retry: { retries: 0 } })
      .getGraph("g")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentGraphTimeoutError);
    expect((error as AgentGraphTimeoutError).timeoutMs).toBe(20);
  });

  it("keeps validateGraph's own signal working", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();
    await expect(createAgentGraphClient({ fetch }).validateGraph(graph as never, { signal: controller.signal })).rejects.toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("createTransport", () => {
  it("can be used directly with a schema", async () => {
    const fetch = vi.fn().mockResolvedValue(json(graph));
    const transport = createTransport({ baseUrl: "http://x", fetch });
    await expect(transport.request("/api/graphs/g", undefined, graphDefinitionSchema)).resolves.toMatchObject({ id: "g 1/x" });
  });
});
