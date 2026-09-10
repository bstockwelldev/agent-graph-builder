import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunSummary } from "./types";
import {
  RUN_STREAM_UNAVAILABLE_MESSAGE,
  RUN_WATCH_POLL_MS,
  RUN_WATCH_TIMEOUT_MS,
  watchRunCompletion,
} from "./watchRun";

const runningSummary: RunSummary = {
  run_id: "run-1",
  graph_id: "graph-1",
  status: "running",
  result: null,
};

describe("watchRunCompletion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("finishes with a timeout failure when polling never reaches a terminal status", async () => {
    const onTerminal = vi.fn();
    const getRun = vi.fn(async () => runningSummary);

    watchRunCompletion({
      initial: runningSummary,
      streamRunEvents: () => () => undefined,
      getRun,
      onEvent: vi.fn(),
      onTerminal,
      timeoutMs: RUN_WATCH_TIMEOUT_MS,
      pollMs: RUN_WATCH_POLL_MS,
    });

    await vi.advanceTimersByTimeAsync(RUN_WATCH_TIMEOUT_MS);

    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal.mock.calls[0][0]).toMatchObject({
      status: "failed",
      error: RUN_STREAM_UNAVAILABLE_MESSAGE,
    });
  });

  it("finishes when polling observes a terminal run status", async () => {
    const onTerminal = vi.fn();
    const succeeded: RunSummary = {
      ...runningSummary,
      status: "succeeded",
      result: { ok: true },
      completed_at: "2026-09-10T12:00:00.000Z",
    };
    const getRun = vi.fn(async () => succeeded);

    watchRunCompletion({
      initial: runningSummary,
      streamRunEvents: () => () => undefined,
      getRun,
      onEvent: vi.fn(),
      onTerminal,
      timeoutMs: RUN_WATCH_TIMEOUT_MS,
      pollMs: RUN_WATCH_POLL_MS,
    });

    await vi.advanceTimersByTimeAsync(RUN_WATCH_POLL_MS);
    await vi.runOnlyPendingTimersAsync();

    expect(getRun).toHaveBeenCalledWith("run-1");
    expect(onTerminal).toHaveBeenCalledWith(succeeded);
  });

  it("stops timers when the watcher is cancelled", async () => {
    const onTerminal = vi.fn();
    const getRun = vi.fn(async () => runningSummary);

    const stop = watchRunCompletion({
      initial: runningSummary,
      streamRunEvents: () => () => undefined,
      getRun,
      onEvent: vi.fn(),
      onTerminal,
      timeoutMs: RUN_WATCH_TIMEOUT_MS,
      pollMs: RUN_WATCH_POLL_MS,
    });

    stop();
    await vi.advanceTimersByTimeAsync(RUN_WATCH_TIMEOUT_MS);

    expect(onTerminal).not.toHaveBeenCalled();
    expect(getRun).not.toHaveBeenCalled();
  });
});
