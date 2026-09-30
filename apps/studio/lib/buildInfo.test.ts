import { describe, expect, it } from "vitest";

import { describeBuild, shortSha } from "./buildInfo";

describe("build info", () => {
  it("shortens commits and says local when unknown", () => {
    expect(shortSha("0123456789abcdef")).toBe("0123456");
    expect(shortSha(null)).toBe("local");
  });

  it("flags a studio and API on different commits", () => {
    expect(describeBuild("aaaaaaa1", "aaaaaaa1")).toEqual({ text: "Studio aaaaaaa · API aaaaaaa", mismatch: false });
    expect(describeBuild("aaaaaaa1", "bbbbbbb2").mismatch).toBe(true);
    expect(describeBuild(null, "bbbbbbb2")).toEqual({ text: "Studio local · API bbbbbbb", mismatch: false });
    expect(describeBuild("aaaaaaa1", undefined).text).toBe("Studio aaaaaaa · API …");
  });
});
