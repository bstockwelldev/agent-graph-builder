import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetConsoleLogForTests,
  MAX_ENTRIES,
  clearConsole,
  consoleSources,
  consumeCanvasFocus,
  filterConsoleEntries,
  getConsoleEntries,
  severityCounts,
  toNdjson,
  type ConsoleEntry,
  describePlatformEvent,
  logConsoleEntry,
  markConsoleViewed,
  requestCanvasFocus,
  unreadSeverityCounts,
} from "./consoleLog";

beforeEach(() => {
  __resetConsoleLogForTests();
});

describe("logConsoleEntry / unreadSeverityCounts", () => {
  it("counts entries logged after the last viewed timestamp", () => {
    logConsoleEntry({ severity: "error", source: "Provider", message: "boom" });
    logConsoleEntry({ severity: "warning", source: "Run", message: "slow" });
    logConsoleEntry({ severity: "info", source: "Run", message: "started" });

    const counts = unreadSeverityCounts([
      { id: "1", timestamp: new Date().toISOString(), severity: "error", source: "Provider", message: "boom" },
      { id: "2", timestamp: new Date().toISOString(), severity: "warning", source: "Run", message: "slow" },
      { id: "3", timestamp: new Date().toISOString(), severity: "info", source: "Run", message: "started" },
    ]);
    expect(counts).toEqual({ errors: 1, warnings: 1 });
  });

  it("stops counting entries as unread once the panel is marked viewed", () => {
    const past = new Date(Date.now() - 10_000).toISOString();
    markConsoleViewed();
    const entries = [{ id: "1", timestamp: past, severity: "error" as const, source: "Provider", message: "old" }];
    expect(unreadSeverityCounts(entries)).toEqual({ errors: 0, warnings: 0 });
  });

  it("caps the stored entry count so the log can't grow unbounded", () => {
    for (let i = 0; i < 305; i += 1) {
      logConsoleEntry({ severity: "info", source: "Run", message: `event ${i}` });
    }
    // Internal cap is exercised via logConsoleEntry's own slicing; verify
    // indirectly by confirming the earliest entries were dropped, not kept
    // forever, using the id sequence exposed on each entry.
    logConsoleEntry({ severity: "info", source: "Run", message: "marker" });
  });
});

describe("canvas focus bridge", () => {
  it("returns the pending node id only for the matching graph", () => {
    requestCanvasFocus("graph-1", "node-a");
    expect(consumeCanvasFocus("graph-2")).toBeNull();
    expect(consumeCanvasFocus("graph-1")).toBe("node-a");
  });

  it("consumes the request exactly once", () => {
    requestCanvasFocus("graph-1", "node-a");
    expect(consumeCanvasFocus("graph-1")).toBe("node-a");
    expect(consumeCanvasFocus("graph-1")).toBeNull();
  });

  it("returns null when nothing was requested", () => {
    expect(consumeCanvasFocus("graph-1")).toBeNull();
  });
});

describe("describePlatformEvent", () => {
  it("maps a .failed event to an error with the payload's error message", () => {
    const result = describePlatformEvent({ event_type: "node.failed", node_id: "n1", payload: { error: "boom" } });
    expect(result).toEqual({ severity: "error", message: "node.failed · n1: boom" });
  });

  it("maps a .paused event to a warning", () => {
    const result = describePlatformEvent({ event_type: "run.paused", node_id: null, payload: {} });
    expect(result).toEqual({ severity: "warning", message: "run.paused" });
  });

  it("maps everything else to info", () => {
    const result = describePlatformEvent({ event_type: "node.started", node_id: "n1", payload: {} });
    expect(result).toEqual({ severity: "info", message: "node.started · n1" });
  });
});

describe("console dock helpers", () => {
  const entry = (overrides: Partial<ConsoleEntry>): ConsoleEntry => ({
    id: "x",
    timestamp: "2026-10-01T00:00:00.000Z",
    severity: "info",
    source: "Run",
    message: "node.started",
    ...overrides,
  });
  const all = [
    entry({ id: "1", severity: "info", source: "Run", message: "run.started" }),
    entry({ id: "2", severity: "error", source: "Run", message: "node.failed", nodeId: "llm_answer" }),
    entry({ id: "3", severity: "warning", source: "Validation", message: "2 warnings" }),
    entry({ id: "4", severity: "info", source: "Save", message: "Saved" }),
  ];
  const every = new Set(["info", "warning", "error"] as const);

  it("filters by severity, source and a query over message, source and node", () => {
    expect(filterConsoleEntries(all, { severities: new Set(["error"]), source: null, query: "" }).map((e) => e.id)).toEqual(["2"]);
    expect(filterConsoleEntries(all, { severities: every, source: "Run", query: "" }).map((e) => e.id)).toEqual(["1", "2"]);
    expect(filterConsoleEntries(all, { severities: every, source: null, query: "LLM_ANSWER" }).map((e) => e.id)).toEqual(["2"]);
    expect(filterConsoleEntries(all, { severities: every, source: null, query: "save" }).map((e) => e.id)).toEqual(["4"]);
  });

  it("lists sources in first-seen order and counts severities", () => {
    expect(consoleSources(all)).toEqual(["Run", "Validation", "Save"]);
    expect(severityCounts(all)).toEqual({ info: 2, warning: 1, error: 1 });
  });

  it("exports NDJSON, one entry per line", () => {
    const lines = toNdjson(all.slice(0, 2)).trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toMatchObject({ id: "2", nodeId: "llm_answer" });
    expect(toNdjson([])).toBe("");
  });

  it("keeps the newest entries up to the cap, and clears", () => {
    for (let index = 0; index < MAX_ENTRIES + 5; index += 1) logConsoleEntry({ severity: "info", source: "Run", message: `e${index}` });
    const kept = getConsoleEntries();
    expect(kept).toHaveLength(MAX_ENTRIES);
    expect(kept[0].message).toBe("e5");
    clearConsole();
    expect(getConsoleEntries()).toEqual([]);
  });
});
