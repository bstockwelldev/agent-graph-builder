import { describe, expect, it } from "vitest";

import { insertPlaceholder, openPlaceholderAt, suggestPlaceholders, templateSegments } from "./templateEditor";

// studio-graph-workbench-redesign-plan.md, Wave 2.5.
describe("templateEditor helpers", () => {
  it("segments known and unknown placeholders", () => {
    expect(templateSegments("Hi {question}, see {nope}.", ["question"])).toEqual([
      { text: "Hi ", kind: "text" },
      { text: "{question}", kind: "known" },
      { text: ", see ", kind: "text" },
      { text: "{nope}", kind: "unknown" },
      { text: ".", kind: "text" },
    ]);
    expect(templateSegments("", [])).toEqual([]);
  });

  it("detects an open placeholder at the caret", () => {
    expect(openPlaceholderAt("Hi {que", 7)).toEqual({ partial: "que", start: 3 });
    expect(openPlaceholderAt("Hi {", 4)).toEqual({ partial: "", start: 3 });
    expect(openPlaceholderAt("Hi {q} x", 8)).toBeNull();
  });

  it("inserts the chosen variable and places the caret after it", () => {
    expect(insertPlaceholder("Hi {que", 7, "question")).toEqual({ value: "Hi {question}", caret: 13 });
    expect(insertPlaceholder("Hi {}", 4, "topic")).toEqual({ value: "Hi {topic}", caret: 10 });
  });

  it("suggests by prefix, de-duplicated", () => {
    expect(suggestPlaceholders(["question", "upstream", "question", "quota"], "qu")).toEqual(["question", "quota"]);
    expect(suggestPlaceholders(["a", "b"], "")).toEqual(["a", "b"]);
  });
});
