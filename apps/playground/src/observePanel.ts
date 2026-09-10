import type { PlatformEvent } from "./types";

export const OBSERVE_SECTION_IDS = ["observe-status", "observe-trace", "observe-events", "observe-history"] as const;
export type ObserveSectionId = (typeof OBSERVE_SECTION_IDS)[number];
export const OBSERVE_OPEN_STORAGE_KEY = "observe-open";

export const LIVE_EVENT_LOG_EMPTY = "No events yet. Run the graph to stream node lifecycle events here.";
export const INSPECTED_EVENT_LOG_EMPTY = "Events were not recorded for this inspected run.";
export const INSPECT_LOAD_FAIL = "Could not load this run. Retry.";
export const TRACE_SELECT_NODE = "Select a node to see its trace.";
export const TRACE_MISSING = "No trace for this node.";

export function nextExclusiveOpenId(current: string | null, clicked: string): string | null {
  return current === clicked ? null : clicked;
}

export function isObserveSectionId(value: string | null): value is ObserveSectionId {
  return OBSERVE_SECTION_IDS.some((id) => id === value);
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
