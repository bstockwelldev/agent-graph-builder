import { describe, expect, it, vi } from "vitest";

import { createAgentGraphClient } from "./client.js";
import { AgentGraphResponseError, AgentGraphTimeoutError } from "./errors.js";
import { parseSse } from "./runs.js";
import { applyRunEvent, stepsFromTraces } from "./runSteps.js";

// SDK 2/7 (STO-615): universal SSE, resumable run streams, waitForRun.

const encoder = new TextEncoder();
const body = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
const sse = (...chunks: string[]) => new Response(body(...chunks), { headers: { "content-type": "text/event-stream" } });
const event = (sequence: number, event_type = "node.started", node_id: string | null = "n1") =>
  `id: ${sequence}\ndata: ${JSON.stringify({ event_type, run_id: "r1", node_id, occurred_at: "t", sequence, payload: {} })}\n\n`;
const summary = (status: string) =>
  new Response(JSON.stringify({ run_id: "r1", graph_id: "g", status, result: status === "succeeded" ? "ok" : null }), {
    headers: { "content-type": "application/json" },
  });

async function collect<T>(iterator: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterator) out.push(item);
  return out;
}

describe("parseSse", () => {
  it("handles split chunks, CRLF, multi-line data, comments and retry", async () => {
    const messages = await collect(parseSse(body("retry: 500\n\n: hello\n", "id: 1\r\nda", "ta: a\r\ndata: b\r\n\r\nevent: x\ndata: {}\n\n")));
    expect(messages).toEqual([
      { id: "1", event: undefined, data: "a\nb", retry: undefined },
      { id: undefined, event: "x", data: "{}", retry: undefined },
    ]);
  });
});

describe("runs.stream", () => {
  it("resumes after a drop with Last-Event-ID and never repeats an event", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(sse(event(1), event(2))) // drops mid-run
      .mockResolvedValueOnce(sse(event(2), event(3), event(4, "run.completed", null))); // server replays 2 again
    const client = createAgentGraphClient({ fetch });
    const events = await collect(client.runs.stream("r1", { reconnectDelayMs: 1 }));
    expect(events.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    const second = fetch.mock.calls[1][1] as RequestInit;
    expect(new Headers(second.headers).get("last-event-id")).toBe("2");
    expect(fetch.mock.calls[0][0]).toBe("/api/runs/r1/events");
  });

  it("ends quietly when the server has no live bus", async () => {
    const fetch = vi.fn().mockResolvedValue(sse("retry: 1000\n\n", ": no live bus\n\n"));
    expect(await collect(createAgentGraphClient({ fetch }).runs.stream("r1"))).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed event with AgentGraphResponseError", async () => {
    const fetch = vi.fn().mockResolvedValue(sse('data: {"event_type":"nope"}\n\n'));
    await expect(collect(createAgentGraphClient({ fetch }).runs.stream("r1"))).rejects.toBeInstanceOf(AgentGraphResponseError);
  });

  it("gives up after maxReconnects network failures", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(collect(createAgentGraphClient({ fetch }).runs.stream("r1", { maxReconnects: 2, reconnectDelayMs: 1 }))).rejects.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("runs.wait / runs.start", () => {
  it("streams events to onEvent and resolves with the settled summary", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/events") ? sse(event(1), event(2, "run.completed", null)) : url === "/api/runs" ? summary("queued") : summary("succeeded"),
    );
    const client = createAgentGraphClient({ fetch: fetch as never });
    const onEvent = vi.fn();
    const handle = await client.runs.start({ graphId: "g", input: { question: "q" }, provider: "stub" });
    expect(handle.run.status).toBe("queued");
    const settled = await handle.wait({ onEvent, pollMs: 50 });
    expect(settled.status).toBe("succeeded");
    expect(onEvent.mock.calls.map((c) => c[0].sequence)).toEqual([1, 2]);
  });

  it("falls back to polling when there is no stream, and resolves on paused", async () => {
    let polls = 0;
    const fetch = vi.fn(async (url: string) => (url.endsWith("/events") ? sse(": no live bus\n\n") : summary(++polls < 3 ? "running" : "paused")));
    const settled = await createAgentGraphClient({ fetch: fetch as never }).runs.wait("r1", { pollMs: 5 });
    expect(settled.status).toBe("paused");
  });

  it("rejects on timeout and on abort", async () => {
    const fetch = vi.fn(async (url: string) => (url.endsWith("/events") ? sse(": no live bus\n\n") : summary("running")));
    const client = createAgentGraphClient({ fetch: fetch as never });
    await expect(client.runs.wait("r1", { timeoutMs: 30, pollMs: 5 })).rejects.toBeInstanceOf(AgentGraphTimeoutError);
    const controller = new AbortController();
    const pending = client.runs.wait("r1", { signal: controller.signal, pollMs: 5 });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("run steps (moved from Studio)", () => {
  it("folds events and reads traces", () => {
    const started = applyRunEvent([], { event_type: "node.started", run_id: "r", node_id: "a", occurred_at: "t1", sequence: 1, payload: {} });
    expect(started).toEqual([{ nodeId: "a", status: "running", startedAt: "t1" }]);
    expect(stepsFromTraces([{ node_id: "a", node_type: "llm", status: "succeeded", started_at: "t", completed_at: "t2" } as never])[0]).toMatchObject({
      nodeId: "a",
      status: "succeeded",
    });
  });
});

// A live end-to-end run against a stub backend: AGB_E2E_URL=http://127.0.0.1:8000 pnpm test
describe.skipIf(!process.env.AGB_E2E_URL)("end to end (live backend)", () => {
  it("runs the demo graph on the stub provider and streams it to completion", async () => {
    const client = createAgentGraphClient({ baseUrl: process.env.AGB_E2E_URL });
    const events: string[] = [];
    const handle = await client.runs.start({ graphId: "demo_classify_and_route", input: { question: "how does a database index work" }, provider: "stub" });
    const settled = await handle.wait({ onEvent: (e) => events.push(e.event_type), timeoutMs: 20_000 });
    expect(settled.status).toBe("succeeded");
    expect(events).toContain("node.completed");
    const replay = await collect(client.runs.stream(handle.run.run_id, { lastEventId: 2 }));
    expect(replay[0].sequence).toBe(3);
  });
});
