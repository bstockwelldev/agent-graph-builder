import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { insertExample } from "@/components/graph/GenuiSurfaceEditor";

import { parseGenuiSurface } from "./genui";
import { GENUI_CATALOG, GENUI_PATTERN, surfaceJson } from "./genuiCatalog";

type Case = { name: string; surface: unknown };
const fixtures = JSON.parse(readFileSync(resolve(__dirname, "../../../packages/agent-graph-sdk/contract/genui-surfaces.json"), "utf8")) as {
  valid: Case[];
  invalid: Case[];
};

// resource-forms-consistency-plan.md, slice 5 part 2: the studio and the
// backend (backend/tests/test_genui_surface.py) agree on the shared fixtures.
describe("GenUI schema contract", () => {
  it.each(fixtures.valid)("accepts $name", ({ surface }) => {
    expect(parseGenuiSurface(JSON.stringify(surface)).error).toBeNull();
  });
  it.each(fixtures.invalid)("rejects $name", ({ surface }) => {
    expect(parseGenuiSurface(JSON.stringify(surface)).error).not.toBeNull();
  });
});

describe("GenUI catalog", () => {
  it("has one valid example per component, covering every component type", () => {
    for (const entry of GENUI_CATALOG) expect(parseGenuiSurface(surfaceJson(entry.example)).error, entry.type).toBeNull();
    expect(parseGenuiSurface(surfaceJson(GENUI_PATTERN)).error).toBeNull();
    expect(new Set(GENUI_CATALOG.map((entry) => entry.type)).size).toBe(14);
  });

  it("inserts examples into the surface being edited", () => {
    const text = { type: "Text" as const, props: { content: "x" } };
    // Empty or invalid: replaced.
    expect(JSON.parse(insertExample("", text))).toEqual({ root: text });
    expect(JSON.parse(insertExample("{", text))).toEqual({ root: text });
    // A column Stack gains a child.
    const stack = surfaceJson({ type: "Stack", children: [text] });
    expect(JSON.parse(insertExample(stack, text)).root.children).toHaveLength(2);
    // Anything else is wrapped with it in a new Stack.
    const wrapped = JSON.parse(insertExample(surfaceJson(text), { type: "Checkbox", id: "c", props: { label: "C" } }));
    expect(wrapped.root).toMatchObject({ type: "Stack", children: [text, { type: "Checkbox" }] });
  });
});
