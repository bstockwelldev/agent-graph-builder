import { describe, expect, it } from "vitest";

import type { PlatformEvent } from "./types";
import {
  INSPECTED_EVENT_LOG_EMPTY,
  LIVE_EVENT_LOG_EMPTY,
  eventLogEmptyMessage,
  nextExclusiveOpenId,
  resolveEventLogEvents,
} from "./observePanel";

const event = (sequence: number): PlatformEvent => ({
  sequence,
  event_type: "node.started",
  occurred_at: "2026-09-10T00:00:00.000Z",
  run_id: "run-1",
  node_id: "router_1",
  payload: {},
});

describe("nextExclusiveOpenId", () => {
  it("opens B and closes A", () => {
    expect(nextExclusiveOpenId("observe-status", "observe-trace")).toBe("observe-trace");
  });

  it("collapses the open section when it is clicked again", () => {
    expect(nextExclusiveOpenId("observe-events", "observe-events")).toBeNull();
  });
});

describe("resolveEventLogEvents", () => {
  it("prefers live streamed events", () => {
    expect(resolveEventLogEvents([event(1)], [event(9)])).toEqual([event(1)]);
  });

  it("hydrates from runSummary.events when the live list is empty", () => {
    expect(resolveEventLogEvents([], [event(2), event(3)])).toEqual([event(2), event(3)]);
  });

  it("returns an empty list when neither source has events", () => {
    expect(resolveEventLogEvents([], [])).toEqual([]);
    expect(resolveEventLogEvents([])).toEqual([]);
  });
});

describe("eventLogEmptyMessage", () => {
  it("keeps live idle copy", () => {
    expect(eventLogEmptyMessage(false)).toBe(LIVE_EVENT_LOG_EMPTY);
  });

  it("uses distinct copy for an inspected historical run", () => {
    expect(eventLogEmptyMessage(true)).toBe(INSPECTED_EVENT_LOG_EMPTY);
    expect(eventLogEmptyMessage(true)).not.toBe(LIVE_EVENT_LOG_EMPTY);
  });
});
