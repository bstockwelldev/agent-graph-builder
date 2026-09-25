import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { graphDefinitionSchema } from "../schemas.js";
import type { Diagnostic } from "../types.js";
import { STRUCTURAL_CODES, validateStructure } from "./validate.js";

// SDK 5/7 (STO-620): the local validation agrees with the backend compiler
// on contract/structural-fixtures.json (the backend's
// tests/test_structural_fixtures.py checks the same file).

type Expected = { code: string; severity: "error" | "warning"; node_id: string | null; edge_id: string | null };
const fixtures = JSON.parse(readFileSync(new URL("../../contract/structural-fixtures.json", import.meta.url), "utf8")) as {
  codes: string[];
  cases: { name: string; graph: unknown; expected: Expected[] }[];
};

const key = (d: Pick<Diagnostic, "code" | "severity"> & { node_id?: string | null; edge_id?: string | null }) =>
  [d.code, d.severity, d.node_id ?? "", d.edge_id ?? ""].join("|");

describe("validateStructure", () => {
  it("implements exactly the shared structural codes", () => {
    expect([...STRUCTURAL_CODES].sort()).toEqual([...fixtures.codes].sort());
  });

  it.each(fixtures.cases.map((c) => [c.name, c] as const))("%s matches the backend", (_name, fixture) => {
    const graph = graphDefinitionSchema.parse(fixture.graph);
    expect(validateStructure(graph).map(key).sort()).toEqual(fixture.expected.map(key).sort());
  });

  it("uses the backend's messages and blocking flags", () => {
    const cycle = fixtures.cases.find((c) => c.name === "cycle")!;
    expect(validateStructure(graphDefinitionSchema.parse(cycle.graph))).toEqual([
      { severity: "error", code: "GRAPH_INVALID_CYCLE", message: "Graph contains a cycle; this POC supports acyclic graphs only", blocking: true },
    ]);
  });
});
