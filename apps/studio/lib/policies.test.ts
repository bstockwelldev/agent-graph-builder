import { describe, expect, it } from "vitest";

import { exceptionStatus, extendExpiry, formatExpiry, setRuleEnforcement, setRuleParam, sortExceptions } from "./policies";

const NOW = Date.parse("2026-09-23T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetDays: number) => ({ expires_at: new Date(NOW + offsetDays * DAY).toISOString() });

describe("rule settings", () => {
  it("sets and clears enforcement, dropping empty entries", () => {
    const set = setRuleEnforcement({}, "A", "block");
    expect(set).toEqual({ A: { params: {}, enforcement: "block" } });
    expect(setRuleEnforcement(set, "A", null)).toEqual({});
  });

  it("keeps enforcement when a param is cleared", () => {
    let rules = setRuleParam({}, "A", "max", 3);
    rules = setRuleEnforcement(rules, "A", "warn");
    rules = setRuleParam(rules, "A", "max", undefined);
    expect(rules).toEqual({ A: { params: {}, enforcement: "warn" } });
    expect(setRuleEnforcement(rules, "A", null)).toEqual({});
  });
});

describe("exceptions", () => {
  it("classifies active, expiring and expired", () => {
    expect(exceptionStatus(at(30), NOW).state).toBe("active");
    expect(exceptionStatus(at(3), NOW).state).toBe("expiring");
    expect(exceptionStatus(at(-1), NOW).state).toBe("expired");
  });

  it("formats relative expiry", () => {
    expect(formatExpiry(at(3), NOW)).toBe("in 3 days");
    expect(formatExpiry(at(-2), NOW)).toBe("2 days ago");
    expect(formatExpiry(at(0.25), NOW)).toBe("in 6 hours");
  });

  it("extends from now when already expired, else from the current expiry", () => {
    expect(extendExpiry(at(-10), 30, NOW)).toBe(at(30).expires_at);
    expect(extendExpiry(at(5), 30, NOW)).toBe(at(35).expires_at);
  });

  it("sorts expiring first and expired last", () => {
    const sorted = sortExceptions([at(-1), at(40), at(2)], NOW);
    expect(sorted).toEqual([at(2), at(40), at(-1)]);
  });
});
