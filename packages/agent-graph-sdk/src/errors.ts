import { diagnosticSchema } from "./schemas.js";
import type { Diagnostic } from "./types.js";

/**
 * Typed SDK errors (SDK 1/7 -- docs/planning/features/sdk-hardening-plan.md,
 * Phase 1). Every failure a client call can reject with is one of these,
 * so callers branch on `instanceof` / `isAgentGraphApiError` instead of
 * parsing JSON back out of an error message.
 */

/** Base class for every error this SDK throws. */
export class AgentGraphError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The API answered with a non-2xx status. */
export class AgentGraphApiError extends AgentGraphError {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly url: string;
  /** FastAPI's `detail` (a string or an object), else the parsed body. */
  readonly detail: unknown;
  /** Diagnostics from a blocked publish / replay / simulate / compile
   * (422 `{detail: {diagnostics}}` or `{diagnostics}`), when present. */
  readonly diagnostics: Diagnostic[] | undefined;
  /** The raw response body. */
  readonly body: string;

  constructor(init: { status: number; method: string; path: string; url: string; body: string }) {
    const parsed = parseJson(init.body);
    const detail = parsed !== undefined && isRecord(parsed) && "detail" in parsed ? parsed.detail : parsed ?? init.body;
    super(`${init.method} ${init.path} failed (${init.status}): ${detailText(detail) || init.body || "no body"}`);
    this.status = init.status;
    this.method = init.method;
    this.path = init.path;
    this.url = init.url;
    this.body = init.body;
    this.detail = detail;
    this.diagnostics = extractDiagnostics(parsed);
  }
}

/** A 2xx response whose JSON didn't match the SDK's schema. */
export class AgentGraphResponseError extends AgentGraphError {
  readonly method: string;
  readonly path: string;
  readonly issues: unknown[];
  constructor(init: { method: string; path: string; issues: unknown[]; message: string }) {
    super(`${init.method} ${init.path} returned an unexpected shape: ${init.message}`);
    this.method = init.method;
    this.path = init.path;
    this.issues = init.issues;
  }
}

/** The request never got a response (DNS, connection refused, CORS...). */
export class AgentGraphNetworkError extends AgentGraphError {
  readonly method: string;
  readonly path: string;
  constructor(init: { method: string; path: string; cause: unknown }) {
    super(`${init.method} ${init.path} failed: ${errorMessage(init.cause)}`, { cause: init.cause });
    this.method = init.method;
    this.path = init.path;
  }
}

/** The client- or call-level `timeoutMs` elapsed. */
export class AgentGraphTimeoutError extends AgentGraphError {
  readonly method: string;
  readonly path: string;
  readonly timeoutMs: number;
  constructor(init: { method: string; path: string; timeoutMs: number }) {
    super(`${init.method} ${init.path} timed out after ${init.timeoutMs}ms`);
    this.method = init.method;
    this.path = init.path;
    this.timeoutMs = init.timeoutMs;
  }
}

export function isAgentGraphApiError(error: unknown): error is AgentGraphApiError {
  return error instanceof AgentGraphApiError;
}

/** A human-readable line for any error a client call rejects with: the
 * API's `detail` text when there is one, else the error message. */
export function errorText(error: unknown): string {
  if (error instanceof AgentGraphApiError) return detailText(error.detail) || error.message;
  return errorMessage(error);
}

function detailText(detail: unknown): string {
  if (detail === undefined || detail === null) return "";
  if (typeof detail === "string") return detail;
  if (isRecord(detail)) {
    if (typeof detail.message === "string") return detail.message;
    if (Array.isArray(detail.diagnostics)) {
      const first = detail.diagnostics.find((d) => isRecord(d) && typeof d.message === "string") as { message: string } | undefined;
      if (first) return first.message;
    }
  }
  // FastAPI validation errors: [{loc, msg, type}]
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => (isRecord(item) && typeof item.msg === "string" ? item.msg : null)).filter(Boolean);
    if (messages.length > 0) return messages.join("; ");
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function extractDiagnostics(parsed: unknown): Diagnostic[] | undefined {
  const candidates: unknown[] = [];
  if (isRecord(parsed)) {
    candidates.push(parsed.diagnostics);
    if (isRecord(parsed.detail)) candidates.push(parsed.detail.diagnostics);
  }
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    const result = diagnosticSchema.array().safeParse(candidate);
    if (result.success) return result.data;
  }
  return undefined;
}

function parseJson(body: string): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
