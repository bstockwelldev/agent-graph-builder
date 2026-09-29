import { describe, expect, it } from "vitest";

import { asRows, genuiDataFromRun, parseGenuiSurface, resolvePointer, resolveValue, tryParseGenuiSurface } from "./genui";

// resource-forms-consistency-plan.md, slice 5: the surface schema and $ref binding.
describe("genui surfaces", () => {
  it("parses every component and explains what's wrong otherwise", () => {
    const surface = {
      root: {
        type: "Stack",
        children: [
          { type: "Approval", props: { summary: { $ref: "/nodes/llm/output" } } },
          { type: "Chart", props: { kind: "bar", data: [{ x: "a", y: 1 }], x: "x", y: "y" } },
          { type: "Table", props: { rows: { $ref: "/nodes/t/output" } } },
          { type: "KeyValue", props: { items: { a: 1 } } },
          { type: "Diff", props: { before: "a", after: "b" } },
          { type: "Diagram", props: { source: "graph TD\nA-->B" } },
          { type: "Select", id: "s", props: { label: "S", options: ["a", { value: "b", label: "B" }] } },
          { type: "Checkbox", id: "c", props: { label: "C" } },
          { type: "Markdown", props: { content: "**hi**" } },
        ],
      },
    };
    expect(parseGenuiSurface(JSON.stringify(surface))).toMatchObject({ error: null, surface });
    expect(parseGenuiSurface("  ")).toEqual({ surface: null, error: null });
    expect(parseGenuiSurface("{").error).toMatch(/^Not valid JSON/);
    expect(parseGenuiSurface('{"root":{"type":"Select","id":"s","props":{"label":"S","options":[]}}}').error).toMatch(/^root\.props\.options/);
    expect(parseGenuiSurface('{"root":{"type":"Sparkles"}}').error).toMatch(/^root\.type/);
    expect(tryParseGenuiSurface('{"root":{"type":"Text","props":{"content":"x"}}}')).not.toBeNull();
  });

  it("resolves JSON Pointers into the run, reading through JSON strings", () => {
    const data = genuiDataFromRun({ question: "Q" }, [
      { node_id: "llm", status: "succeeded", input: null, output: '{"rows":[{"a/b":1,"t~x":2}]}' } as never,
    ]);
    expect(resolvePointer(data, "/input/question")).toEqual({ found: true, value: "Q" });
    expect(resolvePointer(data, "/nodes/llm/output/rows/0/a~1b")).toEqual({ found: true, value: 1 });
    expect(resolvePointer(data, "/nodes/llm/output/rows/0/t~0x")).toEqual({ found: true, value: 2 });
    expect(resolvePointer(data, "/nodes/llm/output/rows/9")).toEqual({ found: false });
    expect(resolvePointer(data, "/nodes/missing")).toEqual({ found: false });

    // At any depth, reporting the first pointer that didn't resolve.
    expect(resolveValue({ q: { $ref: "/input/question" }, n: [1, { $ref: "/nope" }] }, data)).toEqual({ value: { q: "Q", n: [1, undefined] }, missing: "/nope" });
    expect(resolveValue({ $ref: "/input/question" }, null)).toEqual({ value: undefined, missing: "/input/question" });
    expect(resolveValue("plain", null)).toEqual({ value: "plain", missing: null });
  });

  it("accepts rows as a list of objects or JSON text of one", () => {
    expect(asRows([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(asRows('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(asRows([1, 2])).toBeNull();
    expect(asRows("nope")).toBeNull();
  });
});
