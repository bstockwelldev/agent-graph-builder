import { describe, expect, it } from "vitest";

import { diffHunks, diffText } from "./textDiff";

describe("text diff", () => {
  it("finds changed lines around a shared prefix and suffix", () => {
    expect(diffText("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "B" },
      { kind: "same", text: "c" },
      { kind: "added", text: "d" },
    ]);
  });

  it("handles long texts with a small change", () => {
    const before = Array.from({ length: 5000 }, (_, index) => `line ${index}`).join("\n");
    const after = before.replace("line 2500", "changed");
    const lines = diffText(before, after);
    expect(lines.filter((line) => line.kind !== "same")).toEqual([
      { kind: "removed", text: "line 2500" },
      { kind: "added", text: "changed" },
    ]);
    const hunks = diffHunks(lines, 1);
    expect(hunks).toEqual([
      { kind: "skip", count: 2499 },
      { kind: "same", text: "line 2499" },
      { kind: "removed", text: "line 2500" },
      { kind: "added", text: "changed" },
      { kind: "same", text: "line 2501" },
      { kind: "skip", count: 2498 },
    ]);
  });
});
