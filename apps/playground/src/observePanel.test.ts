import { describe, expect, it } from "vitest";

import type { PlatformEvent } from "./types";
import {
  INSPECTED_EVENT_LOG_EMPTY,
  LIVE_EVENT_LOG_EMPTY,
  eventLogEmptyMessage,
  formatRunResult,
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

describe("formatRunResult", () => {
  it("returns empty for nullish and blank strings", () => {
    expect(formatRunResult(null)).toEqual({ kind: "empty" });
    expect(formatRunResult(undefined)).toEqual({ kind: "empty" });
    expect(formatRunResult("   ")).toEqual({ kind: "empty" });
  });

  it("pretty-prints object results", () => {
    const formatted = formatRunResult({ answer: "yes", score: 2 });
    expect(formatted).toEqual({ kind: "json", text: '{\n  "answer": "yes",\n  "score": 2\n}' });
  });

  it("parses and pretty-prints stringified JSON", () => {
    const formatted = formatRunResult('{"route":"technical"}');
    expect(formatted.kind).toBe("json");
    if (formatted.kind === "json") {
      expect(formatted.text).toContain('"route": "technical"');
    }
  });

  it("preserves multiline plain text", () => {
    const text = "line one\nline two";
    expect(formatRunResult(text)).toEqual({ kind: "text", text });
  });

  it("stringifies primitives", () => {
    expect(formatRunResult(42)).toEqual({ kind: "text", text: "42" });
    expect(formatRunResult(true)).toEqual({ kind: "text", text: "true" });
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
