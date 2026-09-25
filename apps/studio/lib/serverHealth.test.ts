import { describe, expect, it } from "vitest";
import { isOfflineRun, isSharedStorage } from "./serverHealth";

describe("offline mode", () => {
  it("treats Supabase, object store and Turso as shared", () => {
    for (const backend of ["supabase", "object_store", "turso"]) expect(isSharedStorage(backend)).toBe(true);
    expect(isSharedStorage("sqlite")).toBe(false);
  });

  it("is offline only for stub runs without a shared store", () => {
    expect(isOfflineRun("stub", "sqlite")).toBe(true);
    expect(isOfflineRun("stub", "supabase")).toBe(false);
    expect(isOfflineRun("groq", "sqlite")).toBe(false);
    expect(isOfflineRun("stub", null)).toBe(false);
  });
});
