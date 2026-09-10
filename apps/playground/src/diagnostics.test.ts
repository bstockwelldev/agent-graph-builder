import { describe, expect, it } from "vitest";

import { fingerprintIssueMaps } from "./diagnostics";
import type { Diagnostic } from "./types";

describe("fingerprintIssueMaps", () => {
  it("returns a stable empty fingerprint when there are no diagnostics", () => {
    expect(fingerprintIssueMaps([])).toBe('{"n":[],"e":[]}');
    expect(fingerprintIssueMaps([])).toBe(fingerprintIssueMaps([]));
  });

  it("ignores diagnostics that are not attached to nodes or edges", () => {
    const unattached: Diagnostic[] = [
      {
        severity: "warning",
        code: "graph.empty",
        message: "Graph has no nodes",
        blocking: false,
      },
    ];

    expect(fingerprintIssueMaps(unattached)).toBe('{"n":[],"e":[]}');
  });
});
