import {
  AgentGraphTimeoutError,
  isAgentGraphApiError,
  type PlatformEvent,
  type RunSummary,
  type WaitForRunOptions,
} from "@bstockwelldev/agent-graph-sdk";

export const RUN_WATCH_TIMEOUT_MS = 30_000;
export const RUN_WATCH_POLL_MS = 1_000;

export const RUN_STREAM_UNAVAILABLE_MESSAGE =
  "Live event stream unavailable on this host. Poll for the run result timed out.";

export const RUN_NOT_FOUND_HINT =
  "Run not found on the server. It may predate the Supabase migration, or be a stub run cached in another browser.";

export function isRunNotFoundError(error: unknown): boolean {
  if (isAgentGraphApiError(error)) return error.status === 404;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("(404)") && message.toLowerCase().includes("run not found");
}

/** Settled: succeeded, failed, or paused at a human gate (nothing more
 * happens without a resume) -- the SDK's `isSettledRun`. */
export function isTerminalRunStatus(status: RunSummary["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "paused";
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

/** `client.runs.wait` (SDK 2/7), or a stand-in with the same contract. */
export type WaitForRun = (runId: string, options: WaitForRunOptions) => Promise<RunSummary>;

type WatchRunOptions = {
  initial: RunSummary;
  wait: WaitForRun;
  onEvent: (event: PlatformEvent) => void;
  onTerminal: (summary: RunSummary) => void;
  timeoutMs?: number;
  pollMs?: number;
};

/**
 * Stream a run's events until it settles, then report its final summary.
 * SDK 2/7 (STO-615): the stream + poll-fallback + timeout logic now lives
 * in the SDK (`client.runs.wait`); this adapts it to the callback shape
 * the Run panel and chat run cards use, and maps a timeout / failed poll
 * onto a failed summary with a readable reason. Returns a stop function.
 */
export function watchRunCompletion(options: WatchRunOptions): () => void {
  const { initial, wait, onEvent, onTerminal, timeoutMs = RUN_WATCH_TIMEOUT_MS, pollMs = RUN_WATCH_POLL_MS } = options;
  const controller = new AbortController();
  wait(initial.run_id, { signal: controller.signal, timeoutMs, pollMs, onEvent })
    .then((summary) => {
      if (!controller.signal.aborted) onTerminal(summary);
    })
    .catch((err: unknown) => {
      if (controller.signal.aborted) return;
      if (err instanceof AgentGraphTimeoutError) {
        onTerminal(timedOutRunSummary(initial));
        return;
      }
      onTerminal(
        failedUnavailableRunSummary(
          initial,
          isRunNotFoundError(err) ? RUN_NOT_FOUND_HINT : "Live stream unavailable (serverless); poll failed.",
        ),
      );
    });
  return () => controller.abort();
}
