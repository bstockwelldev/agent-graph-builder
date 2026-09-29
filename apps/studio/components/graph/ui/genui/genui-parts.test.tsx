import { describe, expect, it } from "vitest";

import { niceTicks } from "./GenuiChart";
import { parseDiagram } from "./GenuiDiagram";
import { diffLines } from "./GenuiDiff";
import { parseMarkdown, renderInline } from "./GenuiMarkdown";

// resource-forms-consistency-plan.md, slice 5: the GenUI components' pure parts.
describe("GenUI parts", () => {
  it("diffs lines", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "B" },
      { kind: "same", text: "c" },
      { kind: "added", text: "d" },
    ]);
  });

  it("parses a Mermaid flowchart subset, and says what it can't read", () => {
    const diagram = parseDiagram("graph LR\n  A[Draft] --> B{Approved?}\n  B -->|yes| C(Ship) --> D((Done))\n  B -.-> A; B --- E");
    expect(diagram.direction).toBe("LR");
    expect(diagram.nodes.map((node) => [node.id, node.label, node.shape])).toEqual([
      ["A", "Draft", "rect"],
      ["B", "Approved?", "diamond"],
      ["C", "Ship", "round"],
      ["D", "Done", "circle"],
      ["E", "E", "rect"],
    ]);
    expect(diagram.edges).toEqual([
      { from: "A", to: "B", label: undefined, style: "solid", arrow: true },
      { from: "B", to: "C", label: "yes", style: "solid", arrow: true },
      { from: "C", to: "D", label: undefined, style: "solid", arrow: true },
      { from: "B", to: "A", label: undefined, style: "dotted", arrow: true },
      { from: "B", to: "E", label: undefined, style: "solid", arrow: false },
    ]);
    expect(parseDiagram("flowchart TD\nx-->y").direction).toBe("TB");
    expect(() => parseDiagram("sequenceDiagram\nA->>B: hi")).toThrow(/Start with "graph TD"/);
    expect(() => parseDiagram("graph TD\nA -> B")).toThrow(/Line 2/);
  });

  it("parses a Markdown subset and only links safe URLs", () => {
    expect(parseMarkdown("# Title\n\nSome *text*\ncontinued\n\n- one\n- two\n\n1. first\n\n```\ncode\n```").map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "code",
    ]);
    const inline = renderInline("[ok](https://x.dev) [bad](javascript:alert(1)) `c` **b** *i*");
    const links = inline.filter((part) => typeof part === "object" && part !== null && (part as { type?: unknown }).type === "a");
    expect(links).toHaveLength(1);
    expect(inline).toContain("bad");
  });

  it("picks clean axis ticks from zero", () => {
    expect(niceTicks(3, 151)).toEqual([0, 50, 100, 150, 200]);
    expect(niceTicks(-12, 30)).toEqual([-20, 0, 20, 40]);
    expect(niceTicks(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});
