import { describe, expect, it } from "vitest";
import type { GraphDefinition } from "@bstockwelldev/agent-graph-sdk";

import { checkGraphCode, diagnosticProblems, lineOfPath } from "./graphCode";
import { fromCanonicalJson } from "./jsonEditor";

const graph: GraphDefinition = {
  id: "g1",
  name: "Demo",
  entry_node_id: "in",
  nodes: [
    { id: "in", type: "input", label: "In", config: {}, position: { x: 0, y: 0 } },
    { id: "out", type: "output", label: "Out", config: {}, position: { x: 0, y: 100 } },
  ],
  edges: [{ id: "e1", source: "in", target: "out", kind: "sequence" }],
} as GraphDefinition;

const json = JSON.stringify(graph, null, 2);
const lineOf = (text: string, needle: string) => text.split("\n").findIndex((line) => line.includes(needle)) + 1;

describe("graph code", () => {
  it("maps paths to lines in JSON and YAML, by index or by id", () => {
    expect(lineOfPath(json, ["name"])).toBe(lineOf(json, '"name"'));
    expect(lineOfPath(json, ["nodes", { id: "out" }])).toBe(lineOf(json, '"id": "out"') - 1);
    expect(lineOfPath(json, ["edges", 0, "kind"])).toBe(lineOf(json, '"kind"'));
    const yaml = fromCanonicalJson(json, "yaml");
    expect(lineOfPath(yaml, ["nodes", { id: "out" }])).toBe(lineOf(yaml, "id: out"));
    // A missing key points at the deepest part that exists.
    expect(lineOfPath(json, ["nodes", 1, "missing"])).toBe(lineOfPath(json, ["nodes", 1]));
  });

  it("accepts a valid graph and places syntax, schema and fixed-field errors on lines", () => {
    expect(checkGraphCode(json, "json", "g1")).toEqual({ ok: true, graph: expect.objectContaining({ id: "g1" }) });

    const broken = json.replace('"name": "Demo",', '"name": "Demo"');
    const syntax = checkGraphCode(broken, "json", "g1");
    expect(syntax.ok).toBe(false);
    if (!syntax.ok) expect(syntax.problems[0].line).toBeGreaterThan(1);

    const badKind = json.replace('"kind": "sequence"', '"kind": "sometimes"');
    const schema = checkGraphCode(badKind, "json", "g1");
    expect(schema.ok || schema.problems[0].line).toBe(lineOf(badKind, '"kind"'));

    const otherId = checkGraphCode(json, "json", "g2");
    expect(otherId.ok || otherId.problems[0]).toMatchObject({ line: lineOf(json, '"id": "g1"') });

    const yamlBroken = "id: g1\nname: [unclosed\n";
    const yaml = checkGraphCode(yamlBroken, "yaml", "g1");
    expect(yaml.ok || yaml.problems[0].message).toMatch(/Invalid YAML/);
  });

  it("puts compile diagnostics on their node or edge", () => {
    const problems = diagnosticProblems(json, [
      { severity: "warning", code: "X", node_id: "out", message: "Out is lonely", blocking: false },
      { severity: "error", code: "Y", edge_id: "e1", message: "Edge broken", blocking: true },
      { severity: "error", code: "Z", message: "Graph-wide", blocking: true },
    ]);
    expect(problems.map((problem) => problem.line)).toEqual([lineOfPath(json, ["nodes", 1]), lineOfPath(json, ["edges", 0]), null]);
  });
});
