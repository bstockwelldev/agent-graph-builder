import { errorText, isAgentGraphApiError, type Diagnostic } from "@bstockwelldev/agent-graph-sdk";

/**
 * SDK 1/7 (STO-614): what to show the user for a failed client call. The
 * SDK's typed `AgentGraphApiError` carries the backend's `detail` and any
 * blocked-payload `diagnostics`, so nothing here parses JSON back out of an
 * error message any more.
 */
export function errorDetail(error: unknown): string {
  const blocking = blockingDiagnostics(error);
  const text = errorText(error);
  if (blocking.length === 0) return text;
  const first = blocking[0].message;
  const more = blocking.length > 1 ? ` (+${blocking.length - 1} more)` : "";
  return text.includes(first) ? `${text}${more}` : `${text}: ${first}${more}`;
}

/** Blocking diagnostics from a 422 publish / replay / simulate / compile. */
export function blockingDiagnostics(error: unknown): Diagnostic[] {
  return isAgentGraphApiError(error) ? (error.diagnostics ?? []).filter((d) => d.blocking) : [];
}

/** The seeded demo refused a save (403 `graph_read_only`); the editor
 * forks the edits into a copy instead. */
export function isReadOnlyGraphError(error: unknown): boolean {
  if (!isAgentGraphApiError(error) || error.status !== 403) return false;
  const detail = error.detail;
  return typeof detail === "object" && detail !== null && (detail as { code?: unknown }).code === "graph_read_only";
}
