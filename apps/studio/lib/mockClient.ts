import type { Mock } from "vitest";

/** Test helper (SDK 4/7): resets every `vi.fn()` in a nested mock of the
 * namespaced client (`{ policies: { exceptions: { list: vi.fn() } } }`). */
export function resetClientMock(mock: object): void {
  for (const value of Object.values(mock)) {
    if (typeof value === "function" && "mockReset" in value) (value as Mock).mockReset();
    else if (value && typeof value === "object") resetClientMock(value);
  }
}
