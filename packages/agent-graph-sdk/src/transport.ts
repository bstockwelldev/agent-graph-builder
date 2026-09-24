import type { z } from "zod";

import {
  AgentGraphApiError,
  AgentGraphNetworkError,
  AgentGraphResponseError,
  AgentGraphTimeoutError,
} from "./errors.js";

/**
 * HTTP transport (SDK 1/7 -- docs/planning/features/sdk-hardening-plan.md,
 * Phase 1): an injectable `fetch`, merged + dynamic headers, timeouts and
 * cancellation, idempotent retries with backoff, request/response hooks,
 * and typed errors. Every client method goes through `Transport.request`.
 */

export type HeadersSource = HeadersInit | (() => HeadersInit | Promise<HeadersInit>);

export type RetryOptions = {
  /** Extra attempts after the first (default 2). */
  retries?: number;
  /** First backoff step in ms (default 250); doubles each attempt. */
  baseDelayMs?: number;
  /** Backoff ceiling in ms (default 4000). */
  maxDelayMs?: number;
};

export type RequestContext = {
  method: string;
  url: string;
  path: string;
  /** 1-based attempt number (retries increment it). */
  attempt: number;
};

export type ResponseContext = RequestContext & {
  /** HTTP status, or `null` when the request failed before a response. */
  status: number | null;
  durationMs: number;
};

export type TransportOptions = {
  baseUrl?: string;
  /** Defaults to the global `fetch` (bound at call time, so test stubs apply). */
  fetch?: typeof fetch;
  /** Sent with every request -- e.g. auth. A function is awaited per request. */
  headers?: HeadersSource;
  /** Abort a request (each attempt) after this many ms. Off by default. */
  timeoutMs?: number;
  /** Retry policy for idempotent requests; `false` disables retries. */
  retry?: RetryOptions | false;
  onRequest?: (context: RequestContext) => void;
  onResponse?: (context: ResponseContext) => void;
  /** SDK 3/7: called with the server's `X-AGB-API-Version` header, when sent. */
  onApiVersion?: (serverVersion: string) => void;
};

/** Per-call options -- via `client.with({...})`. */
export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: HeadersInit;
  retry?: RetryOptions | false;
};

type RequestInitLike = Omit<RequestInit, "headers" | "signal"> & { headers?: HeadersInit; signal?: AbortSignal | null };

export const API_VERSION_HEADER = "X-AGB-API-Version";
const IDEMPOTENT = new Set(["GET", "HEAD", "OPTIONS"]);
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_RETRY: Required<RetryOptions> = { retries: 2, baseDelayMs: 250, maxDelayMs: 4000 };

export type Transport = {
  readonly baseUrl: string;
  request<T>(path: string, init?: RequestInitLike, schema?: z.ZodType<T>): Promise<T>;
  /** SDK 2/7: one attempt, returning the raw `Response` (for streaming
   * bodies). Headers, hooks and cancellation apply; no timeout or retry --
   * a stream's caller owns both. Non-2xx rejects with AgentGraphApiError. */
  open(path: string, init?: RequestInitLike): Promise<Response>;
  /** A transport whose calls also carry `options` (merged over this one's). */
  with(options: RequestOptions): Transport;
};

export function createTransport(options: TransportOptions = {}, scoped: RequestOptions = {}): Transport {
  const baseUrl = options.baseUrl ?? "";
  const reportApiVersion = (response: Response) => {
    const version = response.headers?.get?.(API_VERSION_HEADER);
    if (version) options.onApiVersion?.(version);
  };

  async function request<T>(path: string, init: RequestInitLike = {}, schema?: z.ZodType<T>): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase();
    const url = `${baseUrl}${path}`;
    const retry = resolveRetry(scoped.retry ?? options.retry, method);
    const timeoutMs = scoped.timeoutMs ?? options.timeoutMs;
    const callerSignal = anySignal([scoped.signal, init.signal ?? undefined]);
    const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, reqInit?: RequestInit) => fetch(input, reqInit));

    for (let attempt = 1; ; attempt += 1) {
      throwIfAborted(callerSignal);
      const headers = new Headers(await resolveHeaders(options.headers));
      mergeHeaders(headers, scoped.headers);
      mergeHeaders(headers, init.headers);
      // JSON Content-Type only for string bodies: FormData/Blob bodies let
      // the runtime set their own (multipart boundary), no body sends none.
      if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

      // Headers may have been awaited: don't send if the caller aborted meanwhile.
      throwIfAborted(callerSignal);
      const timeout = timeoutMs ? timeoutController(timeoutMs) : null;
      const signal = anySignal([callerSignal, timeout?.signal]);
      const context: RequestContext = { method, url, path, attempt };
      options.onRequest?.(context);
      const started = Date.now();
      let response: Response;
      try {
        response = await fetchImpl(url, { ...init, method, headers, signal });
      } catch (error) {
        timeout?.clear();
        options.onResponse?.({ ...context, status: null, durationMs: Date.now() - started });
        if (timeout?.fired) throw new AgentGraphTimeoutError({ method, path, timeoutMs: timeoutMs! });
        if (callerSignal?.aborted || isAbortError(error)) throw error;
        if (attempt <= retry.retries) {
          await sleep(backoff(retry, attempt, null), callerSignal);
          continue;
        }
        throw new AgentGraphNetworkError({ method, path, cause: error });
      }
      timeout?.clear();
      options.onResponse?.({ ...context, status: response.status, durationMs: Date.now() - started });
      reportApiVersion(response);

      if (!response.ok) {
        if (RETRY_STATUSES.has(response.status) && attempt <= retry.retries) {
          await sleep(backoff(retry, attempt, response.headers.get("Retry-After")), callerSignal);
          continue;
        }
        throw new AgentGraphApiError({ status: response.status, method, path, url, body: await safeText(response) });
      }

      const data: unknown = response.status === 204 ? null : await response.json();
      if (!schema) return data as T;
      const result = schema.safeParse(data);
      if (!result.success) {
        throw new AgentGraphResponseError({ method, path, issues: result.error.issues, message: result.error.message });
      }
      return result.data;
    }
  }

  async function open(path: string, init: RequestInitLike = {}): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const url = `${baseUrl}${path}`;
    const signal = anySignal([scoped.signal, init.signal ?? undefined]);
    const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, reqInit?: RequestInit) => fetch(input, reqInit));
    const headers = new Headers(await resolveHeaders(options.headers));
    mergeHeaders(headers, scoped.headers);
    mergeHeaders(headers, init.headers);
    throwIfAborted(signal);
    const context: RequestContext = { method, url, path, attempt: 1 };
    options.onRequest?.(context);
    const started = Date.now();
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, method, headers, signal });
    } catch (error) {
      options.onResponse?.({ ...context, status: null, durationMs: Date.now() - started });
      if (signal?.aborted || isAbortError(error)) throw error;
      throw new AgentGraphNetworkError({ method, path, cause: error });
    }
    options.onResponse?.({ ...context, status: response.status, durationMs: Date.now() - started });
    reportApiVersion(response);
    if (!response.ok) throw new AgentGraphApiError({ status: response.status, method, path, url, body: await safeText(response) });
    return response;
  }

  return {
    baseUrl,
    request,
    open,
    with: (next) =>
      createTransport(options, {
        ...scoped,
        ...next,
        signal: anySignal([scoped.signal, next.signal]),
        headers: combineHeaders(scoped.headers, next.headers),
      }),
  };
}

/** Encodes a path: ``path`/api/graphs/${id}/runs` `` encodes each value. */
export function path(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return strings.reduce((out, chunk, i) => out + chunk + (i < values.length ? encodeURIComponent(String(values[i])) : ""), "");
}

/** `?a=1&b=2` from defined values only ("" when none). */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

// ------------------------------------------------------------ helpers

function resolveRetry(retry: RetryOptions | false | undefined, method: string): Required<RetryOptions> {
  if (retry === false || !IDEMPOTENT.has(method)) return { ...DEFAULT_RETRY, retries: 0 };
  return { ...DEFAULT_RETRY, ...(retry ?? {}) };
}

/** Full-jitter exponential backoff, or the server's Retry-After. */
function backoff(retry: Required<RetryOptions>, attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, retry.maxDelayMs);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(Math.max(0, at - Date.now()), retry.maxDelayMs);
  }
  const ceiling = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (attempt - 1));
  return Math.random() * ceiling;
}

async function resolveHeaders(source: HeadersSource | undefined): Promise<HeadersInit | undefined> {
  return typeof source === "function" ? await source() : source;
}

function mergeHeaders(target: Headers, source: HeadersInit | undefined): void {
  if (!source) return;
  new Headers(source).forEach((value, key) => target.set(key, value));
}

function combineHeaders(a: HeadersInit | undefined, b: HeadersInit | undefined): HeadersInit | undefined {
  if (!a) return b;
  if (!b) return a;
  const merged = new Headers(a);
  mergeHeaders(merged, b);
  return merged;
}

function timeoutController(ms: number) {
  const controller = new AbortController();
  const state = { fired: false };
  const timer = setTimeout(() => {
    state.fired = true;
    controller.abort(new DOMException(`Timed out after ${ms}ms`, "TimeoutError"));
  }, ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
    get fired() {
      return state.fired;
    },
  };
}

/** `AbortSignal.any` where available, else a linked controller. */
function anySignal(signals: (AbortSignal | undefined | null)[]): AbortSignal | undefined {
  const present = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (present.length <= 1) return present[0];
  const native = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (native) return native.call(AbortSignal, present);
  const controller = new AbortController();
  for (const signal of present) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
