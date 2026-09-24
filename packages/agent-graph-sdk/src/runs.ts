import { AgentGraphResponseError, AgentGraphTimeoutError } from "./errors.js";
import { platformEventSchema } from "./schemas.js";
import { path, type Transport } from "./transport.js";
import type { PlatformEvent, RunSummary } from "./types.js";

/**
 * Run lifecycle (SDK 2/7 -- docs/planning/features/sdk-hardening-plan.md,
 * Phase 4, STO-615): a runtime-agnostic SSE reader (fetch + a streaming
 * body, so it works in browsers, Node 18+ and edge runtimes), a resumable
 * event stream, and `waitForRun` -- stream + poll fallback until the run
 * settles -- absorbing Studio's former lib/watchRun.ts.
 */

// ------------------------------------------------------------ SSE parsing

export type SseMessage = { id?: string; event?: string; data: string; retry?: number };

/** Parses a `text/event-stream` body into messages (comments dropped). */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let current: { id?: string; event?: string; data: string[]; retry?: number } = { data: [] };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.search(/\r\n|\r|\n/)) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + (buffer.startsWith("\r\n", newline) ? 2 : 1));
        if (line === "") {
          if (current.data.length > 0) yield { id: current.id, event: current.event, data: current.data.join("\n"), retry: current.retry };
          current = { data: [] };
          continue;
        }
        if (line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "data") current.data.push(value);
        else if (field === "id") current.id = value;
        else if (field === "event") current.event = value;
        else if (field === "retry" && /^\d+$/.test(value)) current.retry = Number(value);
      }
    }
    if (current.data.length > 0) yield { id: current.id, event: current.event, data: current.data.join("\n"), retry: current.retry };
  } finally {
    reader.releaseLock();
  }
}

// ------------------------------------------------------------ event stream

const TERMINAL_EVENTS = new Set<PlatformEvent["event_type"]>(["run.completed", "run.failed", "run.paused"]);

export type RunStreamOptions = {
  signal?: AbortSignal;
  /** Resume after this event sequence (e.g. from a previous stream). */
  lastEventId?: number;
  /** Reconnect attempts after a dropped connection without progress (default 5). */
  maxReconnects?: number;
  /** Delay before a reconnect, in ms, when the server sends no `retry:` (default 1000). */
  reconnectDelayMs?: number;
};

/**
 * A run's events as an async iterator, validated against the SDK schema.
 * A dropped connection reconnects with `Last-Event-ID`, so events are
 * neither lost nor repeated (duplicates by sequence are skipped too). Ends
 * after `run.completed` / `run.failed` / `run.paused`, or when the server
 * closes a stream that had nothing to send (no live bus on this isolate --
 * poll `getRun` instead; `waitForRun` does). A malformed event rejects with
 * `AgentGraphResponseError`.
 */
export async function* streamRun(transport: Transport, runId: string, options: RunStreamOptions = {}): AsyncGenerator<PlatformEvent> {
  const { signal, maxReconnects = 5 } = options;
  let lastSequence = options.lastEventId ?? 0;
  let reconnects = 0;
  let delayMs = options.reconnectDelayMs ?? 1000;
  const streamPath = path`/api/runs/${runId}/events`;

  for (;;) {
    let progressed = false;
    let sawAnything = false;
    try {
      const response = await transport.open(streamPath, {
        signal,
        headers: { Accept: "text/event-stream", ...(lastSequence > 0 ? { "Last-Event-ID": String(lastSequence) } : {}) },
      });
      if (!response.body) return;
      for await (const message of parseSse(response.body)) {
        if (message.retry !== undefined) delayMs = message.retry;
        sawAnything = true;
        let raw: unknown;
        try {
          raw = JSON.parse(message.data);
        } catch (error) {
          throw new AgentGraphResponseError({ method: "GET", path: streamPath, issues: [{ message: String(error) }], message: `unparseable event: ${message.data.slice(0, 120)}` });
        }
        const parsed = platformEventSchema.safeParse(raw);
        if (!parsed.success) {
          throw new AgentGraphResponseError({ method: "GET", path: streamPath, issues: parsed.error.issues, message: parsed.error.message });
        }
        const event = parsed.data;
        if (event.sequence <= lastSequence) continue;
        lastSequence = event.sequence;
        progressed = true;
        reconnects = 0;
        yield event;
        if (TERMINAL_EVENTS.has(event.event_type)) return;
      }
      // Clean close with nothing new: no live bus here (e.g. serverless).
      if (!sawAnything || !progressed) return;
    } catch (error) {
      if (signal?.aborted || error instanceof AgentGraphResponseError) throw error;
      if (reconnects >= maxReconnects) throw error;
    }
    reconnects += 1;
    if (reconnects > maxReconnects) return;
    await sleep(delayMs, signal);
  }
}

// ------------------------------------------------------------ wait

export type WaitForRunOptions = {
  signal?: AbortSignal;
  /** Give up after this long (default 30s); rejects with AgentGraphTimeoutError. */
  timeoutMs?: number;
  /** Poll `getRun` this often as a fallback to the stream (default 1s). */
  pollMs?: number;
  onEvent?: (event: PlatformEvent) => void;
};

export function isSettledRun(status: RunSummary["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "paused";
}

/**
 * Resolves with the run's summary once it settles (succeeded, failed or
 * paused at a human gate). Streams events to `onEvent` while polling
 * `getRun` as a fallback -- a serverless host may have no live stream.
 * Rejects on abort, timeout (`AgentGraphTimeoutError`), or a failed poll.
 */
export function waitForRun(
  deps: { transport: Transport; getRun: (runId: string) => Promise<RunSummary> },
  runId: string,
  options: WaitForRunOptions = {},
): Promise<RunSummary> {
  const { signal, timeoutMs = 30_000, pollMs = 1_000, onEvent } = options;
  return new Promise<RunSummary>((resolve, reject) => {
    const stop = new AbortController();
    const combined = signal ? anyOf(signal, stop.signal) : stop.signal;
    let settled = false;
    let polling = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      stop.abort();
      fn();
    };
    const poll = async () => {
      if (settled || polling) return;
      polling = true;
      try {
        const latest = await deps.getRun(runId);
        if (isSettledRun(latest.status)) finish(() => resolve(latest));
      } catch (error) {
        finish(() => reject(error));
      } finally {
        polling = false;
      }
    };
    const onAbort = () => finish(() => reject(signal?.reason ?? new DOMException("Aborted", "AbortError")));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });

    const pollTimer = setInterval(() => void poll(), pollMs);
    const timeoutTimer = setTimeout(
      () => finish(() => reject(new AgentGraphTimeoutError({ method: "GET", path: path`/api/runs/${runId}`, timeoutMs }))),
      timeoutMs,
    );
    void (async () => {
      try {
        for await (const event of streamRun(deps.transport, runId, { signal: combined })) {
          onEvent?.(event);
          if (TERMINAL_EVENTS.has(event.event_type)) break;
        }
      } catch {
        // Stream problems fall back to polling below.
      }
      // Stream ended (terminal event, or no live bus): confirm by polling now.
      await poll();
    })();
  });
}

function anyOf(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => controller.abort(signal.reason);
  if (a.aborted) abort(a);
  else if (b.aborted) abort(b);
  else {
    a.addEventListener("abort", () => abort(a), { once: true });
    b.addEventListener("abort", () => abort(b), { once: true });
  }
  return controller.signal;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
