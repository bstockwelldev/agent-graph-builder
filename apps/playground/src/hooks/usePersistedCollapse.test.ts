import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PANEL_SECTIONS_STORAGE_KEY, useExclusiveCollapse, usePersistedCollapse } from "./usePersistedCollapse";

afterEach(() => {
  window.localStorage.clear();
});

describe("useExclusiveCollapse", () => {
  it("opening B closes A and persists only the open id", () => {
    const { result } = renderHook(() => useExclusiveCollapse("observe-open", "observe-status"));

    expect(result.current.openId).toBe("observe-status");

    act(() => {
      result.current.toggleSection("observe-trace");
    });

    expect(result.current.openId).toBe("observe-trace");
    const parsed = JSON.parse(window.localStorage.getItem(PANEL_SECTIONS_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    expect(parsed["observe-open"]).toBe("observe-trace");
    expect(parsed["observe-status"]).toBeUndefined();
    expect(parsed["observe-trace"]).toBeUndefined();
  });

  it("does not restore every former section as open", () => {
    window.localStorage.setItem(
      PANEL_SECTIONS_STORAGE_KEY,
      JSON.stringify({
        "run-status": true,
        "run-node-trace": true,
        "run-event-log": true,
        "run-history": true,
      }),
    );

    const { result } = renderHook(() => useExclusiveCollapse("observe-open", "observe-status"));
    expect(result.current.openId).toBe("observe-status");
  });
});

describe("usePersistedCollapse", () => {
  it("skips persistence when disabled (controlled exclusive children)", () => {
    const { result } = renderHook(() => usePersistedCollapse("observe-status", true, false));
    act(() => {
      result.current.toggle();
    });
    expect(window.localStorage.getItem(PANEL_SECTIONS_STORAGE_KEY)).toBeNull();
  });
});
