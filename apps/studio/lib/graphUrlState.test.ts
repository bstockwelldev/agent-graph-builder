import { describe, expect, it } from "vitest";

import { parseGraphUrlState, serializeGraphUrlState } from "./graphUrlState";

// studio-graph-workbench-redesign-plan.md, Wave 2.
describe("graph URL state", () => {
  it("parses node/tab/run/panel/section", () => {
    expect(parseGraphUrlState("?node=llm_1&tab=history&run=r9&panel=run&section=observe-history")).toEqual({
      node: "llm_1",
      edge: null,
      run: "r9",
      panel: "run",
      tab: "history",
      section: "observe-history",
      view: null,
    });
  });

  it("round-trips the Wave 7d view, omitting the default canvas", () => {
    expect(parseGraphUrlState("?view=layers").view).toBe("layers");
    expect(serializeGraphUrlState({ view: "heatmap" })).toBe("?view=heatmap");
    expect(serializeGraphUrlState({ view: "canvas" }, "?view=layers")).toBe("");
  });

  it("prefers a node over an edge and drops a tab without a node", () => {
    expect(parseGraphUrlState("?node=a&edge=e1").edge).toBeNull();
    expect(parseGraphUrlState("?edge=e1&tab=io")).toMatchObject({ edge: "e1", tab: null });
    expect(parseGraphUrlState("?node=%20")).toMatchObject({ node: null });
  });

  it("serializes, omitting the default tab and the one-shot section", () => {
    expect(serializeGraphUrlState({ node: "a", tab: "configure", panel: "run", section: "x" })).toBe("?node=a&panel=run");
    expect(serializeGraphUrlState({ node: "a", tab: "history", run: "r1" })).toBe("?node=a&tab=history&run=r1");
    expect(serializeGraphUrlState({ edge: "e1" })).toBe("?edge=e1");
    expect(serializeGraphUrlState({})).toBe("");
  });

  it("preserves unrelated params and replaces its own", () => {
    expect(serializeGraphUrlState({ node: "b" }, "?utm=x&node=a&section=observe-history")).toBe("?utm=x&node=b");
  });

  it("round-trips", () => {
    const search = serializeGraphUrlState({ node: "n", tab: "io", run: "r", panel: "releases" });
    expect(serializeGraphUrlState(parseGraphUrlState(search))).toBe(search);
  });
});
