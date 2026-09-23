import type { PlatformEvent } from "@bstockwelldev/agent-graph-sdk";

export const LIVE_EVENT_LOG_EMPTY = "No events yet. Run the graph to stream node lifecycle events here.";
export const INSPECTED_EVENT_LOG_EMPTY = "Events were not recorded for this inspected run.";
export const INSPECT_LOAD_FAIL = "Could not load this run. Retry.";
export const TRACE_SELECT_NODE = "Select a node to see its trace.";
export const TRACE_MISSING = "No trace for this node.";
export const RUN_RESULT_EMPTY = "Run finished with no result payload.";

export type FormattedRunResult =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "json"; text: string };

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

/** Human-readable run result for the Observe panel (pretty JSON, multiline text, primitives). */
export function formatRunResult(result: unknown): FormattedRunResult {
  if (result === null || result === undefined) {
    return { kind: "empty" };
  }

  if (typeof result === "string") {
    if (result.trim() === "") {
      return { kind: "empty" };
    }
    if (looksLikeJson(result)) {
      try {
        const parsed = JSON.parse(result) as unknown;
        return { kind: "json", text: JSON.stringify(parsed, null, 2) };
      } catch {
        return { kind: "text", text: result };
      }
    }
    return { kind: "text", text: result };
  }

  if (typeof result === "object") {
    return { kind: "json", text: JSON.stringify(result, null, 2) };
  }

  return { kind: "text", text: String(result) };
}

export function resolveEventLogEvents(liveEvents: PlatformEvent[], summaryEvents?: PlatformEvent[]): PlatformEvent[] {
  if (liveEvents.length > 0) {
    return liveEvents;
  }
  if (summaryEvents && summaryEvents.length > 0) {
    return summaryEvents;
  }
  return [];
}

export function eventLogEmptyMessage(inspecting: boolean): string {
  return inspecting ? INSPECTED_EVENT_LOG_EMPTY : LIVE_EVENT_LOG_EMPTY;
}
