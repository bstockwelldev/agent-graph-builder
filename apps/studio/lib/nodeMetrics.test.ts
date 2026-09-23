import { describe, expect, it } from "vitest";

import { formatDurationMs, formatRate, isUnhealthy, relativeTime } from "./nodeMetrics";

describe("nodeMetrics formatting", () => {
  it("formats durations", () => {
    expect(formatDurationMs(null)).toBe("—");
    expect(formatDurationMs(420)).toBe("420 ms");
    expect(formatDurationMs(1234)).toBe("1.23 s");
    expect(formatDurationMs(12_345)).toBe("12.3 s");
  });

  it("formats rates", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(2 / 3)).toBe("67%");
  });

  it("flags nodes that fail at least a fifth of the time", () => {
    expect(isUnhealthy({ success_rate: 0.5, failed: 2 })).toBe(true);
    expect(isUnhealthy({ success_rate: 0.9, failed: 1 })).toBe(false);
    expect(isUnhealthy({ success_rate: null, failed: 0 })).toBe(false);
  });

  it("renders relative times", () => {
    const now = Date.parse("2026-09-23T12:00:00Z");
    expect(relativeTime("2026-09-23T11:59:30Z", now)).toBe("30s ago");
    expect(relativeTime("2026-09-23T11:00:00Z", now)).toBe("1h ago");
    expect(relativeTime("2026-09-21T12:00:00Z", now)).toBe("2d ago");
    expect(relativeTime(null, now)).toBe("—");
  });
});
