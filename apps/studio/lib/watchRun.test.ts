import { describe, expect, it, vi } from "vitest";
import { AgentGraphApiError, AgentGraphTimeoutError, type RunSummary } from "@bstockwelldev/agent-graph-sdk";

import { RUN_NOT_FOUND_HINT, RUN_STREAM_UNAVAILABLE_MESSAGE, isTerminalRunStatus, watchRunCompletion } from "./watchRun";

// SDK 2/7 (STO-615): watchRunCompletion adapts client.runs.wait.

const initial = { run_id: "r1", graph_id: "g", status: "running", result: null } as RunSummary;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("watchRunCompletion", () => {
  it("forwards events and the settled summary", async () => {
    const onTerminal = vi.fn();
    const onEvent = vi.fn();
    const wait = vi.fn(async (_id: string, options: { onEvent?: (e: never) => void }) => {
      options.onEvent?.({ sequence: 1 } as never);
      return { ...initial, status: "succeeded" } as RunSummary;
    });
    watchRunCompletion({ initial, wait, onEvent, onTerminal });
    await flush();
    expect(onEvent).toHaveBeenCalledWith({ sequence: 1 });
    expect(onTerminal.mock.calls[0][0].status).toBe("succeeded");
    expect(wait.mock.calls[0][1]).toMatchObject({ timeoutMs: 30_000, pollMs: 1_000 });
  });

  it("maps a timeout and a 404 onto failed summaries with readable reasons", async () => {
    const timedOut = vi.fn();
    watchRunCompletion({ initial, wait: async () => Promise.reject(new AgentGraphTimeoutError({ method: "GET", path: "/x", timeoutMs: 1 })), onEvent: vi.fn(), onTerminal: timedOut });
    const missing = vi.fn();
    const notFound = new AgentGraphApiError({ status: 404, method: "GET", path: "/api/runs/r1", url: "/api/runs/r1", body: '{"detail":"run not found"}' });
    watchRunCompletion({ initial, wait: async () => Promise.reject(notFound), onEvent: vi.fn(), onTerminal: missing });
    await flush();
    expect(timedOut.mock.calls[0][0]).toMatchObject({ status: "failed", error: RUN_STREAM_UNAVAILABLE_MESSAGE });
    expect(missing.mock.calls[0][0]).toMatchObject({ status: "failed", error: RUN_NOT_FOUND_HINT });
  });

  it("stops quietly: no terminal callback after stop", async () => {
    const onTerminal = vi.fn();
    let signal: AbortSignal | undefined;
    const stop = watchRunCompletion({
      initial,
      wait: (_id, options) => {
        signal = options.signal;
        return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))));
      },
      onEvent: vi.fn(),
      onTerminal,
    });
    stop();
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it("treats paused as settled", () => {
    expect(["succeeded", "failed", "paused", "running"].map((s) => isTerminalRunStatus(s as never))).toEqual([true, true, true, false]);
  });
});
