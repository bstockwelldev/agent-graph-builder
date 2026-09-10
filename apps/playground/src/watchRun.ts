import type { PlatformEvent, RunSummary } from "./types";

export const RUN_WATCH_TIMEOUT_MS = 30_000;
export const RUN_WATCH_POLL_MS = 1_000;

export const RUN_STREAM_UNAVAILABLE_MESSAGE =
  "Live event stream unavailable on this host. Poll for the run result timed out.";

export const RUN_NOT_FOUND_HINT =
  "Run not found on this server instance. Production storage is per-isolate until OBJECT_STORE_* (recommended) or TURSO_* env is set.";

export function isRunNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("(404)") && message.toLowerCase().includes("run not found");
}

export function isTerminalRunStatus(status: RunSummary["status"]): boolean {
  return status === "succeeded" || status === "failed";
}

export function timedOutRunSummary(current: RunSummary): RunSummary {
  return {
    ...current,
    status: "failed",
    error: RUN_STREAM_UNAVAILABLE_MESSAGE,
    completed_at: new Date().toISOString(),
  };
}

export function failedUnavailableRunSummary(current: RunSummary, detail: string): RunSummary {
  return {
    ...current,
    status: "failed",
    error: detail,
    completed_at: new Date().toISOString(),
  };
}

type WatchRunOptions = {
  initial: RunSummary;
  streamRunEvents: (
    runId: string,
    onEvent: (event: PlatformEvent) => void,
    onClose?: () => void,
  ) => () => void;
  getRun: (runId: string) => Promise<RunSummary>;
  onEvent: (event: PlatformEvent) => void;
  onTerminal: (summary: RunSummary) => void;
  timeoutMs?: number;
  pollMs?: number;
};

export function watchRunCompletion(options: WatchRunOptions): () => void {
  const {
    initial,
    streamRunEvents,
    getRun,
    onEvent,
    onTerminal,
    timeoutMs = RUN_WATCH_TIMEOUT_MS,
    pollMs = RUN_WATCH_POLL_MS,
  } = options;
  const runId = initial.run_id;
  let stopped = false;
  let inflight = false;
  let stopStream: () => void = () => undefined;
  let pollTimer: number | undefined;
  let timeoutTimer: number | undefined;

  const finish = (summary: RunSummary) => {
    if (stopped) return;
    stopped = true;
    if (pollTimer !== undefined) window.clearInterval(pollTimer);
    if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer);
    stopStream();
    onTerminal(summary);
  };

  const pollOnce = async () => {
    if (stopped || inflight) return;
    inflight = true;
    try {
      const latest = await getRun(runId);
      if (isTerminalRunStatus(latest.status)) {
        finish(latest);
      }
    } catch (err: unknown) {
      finish(
        failedUnavailableRunSummary(
          initial,
          isRunNotFoundError(err)
            ? RUN_NOT_FOUND_HINT
            : "Live stream unavailable (serverless); poll failed.",
        ),
      );
    } finally {
      inflight = false;
    }
  };

  stopStream = streamRunEvents(runId, onEvent, () => {
    void pollOnce();
  });

  pollTimer = window.setInterval(() => {
    void pollOnce();
  }, pollMs);

  timeoutTimer = window.setTimeout(() => {
    finish(timedOutRunSummary(initial));
  }, timeoutMs);

  return () => {
    if (stopped) return;
    stopped = true;
    if (pollTimer !== undefined) window.clearInterval(pollTimer);
    if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer);
    stopStream();
  };
}
