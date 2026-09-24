import { describe, expect, it } from "vitest";
import type { PlatformEvent } from "@bstockwelldev/agent-graph-sdk";
import {
  applyRunEvent,
  buildRunInput,
  findGraph,
  matchRunIntent,
  needsConfirmation,
  parseRunCommand,
  stepsFromTraces,
} from "./chatRuns";

const demo = { id: "demo_classify_and_route", name: "Classify & Route (demo)", input_variables: ["question"] };
const twoInputs = { id: "two_inputs", name: "Explain for audience", input_variables: ["topic", "audience"] };
const graphs = [demo, twoInputs];

// studio-ux-gap-remediation-plan.md §4-5 (STO-600/601).
describe("chat runs", () => {
  it("builds run input from key=value pairs or free text", () => {
    expect(buildRunInput(["topic", "audience"], 'topic=TCP audience="ten year olds"')).toEqual({ topic: "TCP", audience: "ten year olds" });
    expect(buildRunInput(["question"], "How does TCP work?")).toEqual({ question: "How does TCP work?" });
    expect(buildRunInput(["question"], "")).toEqual({});
    // A key that isn't an input variable means the whole text is free text.
    expect(buildRunInput(["question"], "what is x=1?")).toEqual({ question: "what is x=1?" });
  });

  it("finds graphs by id or by name, ignoring case and punctuation", () => {
    expect(findGraph(graphs, "two_inputs")).toBe(twoInputs);
    expect(findGraph(graphs, "classify & route demo")).toBe(demo);
    expect(findGraph(graphs, "nope")).toBeNull();
  });

  it("parses /run with graph ids, names, release selectors and input", () => {
    expect(parseRunCommand("hello", graphs)).toBeNull();
    const draft = parseRunCommand("/run demo_classify_and_route How does TCP work?", graphs);
    expect(draft).toEqual({ ok: true, target: { graph: demo, release: null, input: { question: "How does TCP work?" }, inferred: false } });
    const latest = parseRunCommand('/run "Explain for audience"@latest topic=TCP audience=kids', graphs);
    expect(latest).toMatchObject({ ok: true, target: { graph: twoInputs, release: "latest", input: { topic: "TCP", audience: "kids" } } });
    expect(parseRunCommand("/run Explain for audience@rel_abc topic=x", graphs)).toMatchObject({ ok: true, target: { release: "rel_abc", input: { topic: "x" } } });
    expect(parseRunCommand("/run missing graph", graphs)).toEqual({ ok: false, error: 'No graph named "missing".' });
    expect(parseRunCommand("/run", graphs)).toMatchObject({ ok: false });
  });

  it("matches plain-text run requests only for real graphs, always inferred", () => {
    expect(matchRunIntent("please run the Explain for audience graph", graphs)).toEqual({ graph: twoInputs, release: null, input: {}, inferred: true });
    expect(matchRunIntent("run two_inputs", graphs)?.graph).toBe(twoInputs);
    const flowNamed = [{ ...demo, id: "s", name: "Support flow" }];
    expect(matchRunIntent("please run the support flow", flowNamed)?.graph.id).toBe("s");
    expect(matchRunIntent("run the support flow graph", flowNamed)?.graph.id).toBe("s");
    expect(matchRunIntent("run a marathon", graphs)).toBeNull();
    expect(matchRunIntent("how do I run this?", graphs)).toBeNull();
  });

  it("confirms release runs and inferred runs; drafts from explicit commands run at once", () => {
    expect(needsConfirmation({ release: null, inferred: false })).toBe(false);
    expect(needsConfirmation({ release: "latest", inferred: false })).toBe(true);
    expect(needsConfirmation({ release: null, inferred: true })).toBe(true);
  });

  it("folds streamed node events into steps, then prefers stored traces", () => {
    const ev = (type: string, nodeId: string, payload: Record<string, unknown> = {}): PlatformEvent =>
      ({ sequence: 1, event_type: type, occurred_at: "2026-09-23T00:00:0" + (type === "node.started" ? "0" : "1") + ".000Z", run_id: "r", node_id: nodeId, payload }) as PlatformEvent;
    let steps = applyRunEvent([], ev("node.started", "input_1"));
    expect(steps).toEqual([{ nodeId: "input_1", status: "running", startedAt: "2026-09-23T00:00:00.000Z" }]);
    steps = applyRunEvent(steps, ev("node.completed", "input_1", { input: { q: 1 }, output: "x" }));
    expect(steps[0]).toMatchObject({ status: "succeeded", output: "x", input: { q: 1 } });
    steps = applyRunEvent(steps, ev("node.failed", "llm_1", { error: "boom" }));
    expect(steps[1]).toMatchObject({ nodeId: "llm_1", status: "failed", error: "boom" });
    expect(applyRunEvent(steps, { ...ev("run.completed", "x"), node_id: null } as PlatformEvent)).toHaveLength(2);

    expect(
      stepsFromTraces([
        { node_id: "b", node_type: "llm", status: "succeeded", input: 1, output: 2, started_at: "2026-01-01T00:00:02Z", completed_at: "2026-01-01T00:00:03Z" },
        { node_id: "a", node_type: "input", status: "succeeded", input: 0, output: 1, started_at: "2026-01-01T00:00:01Z", completed_at: "2026-01-01T00:00:01Z" },
      ] as never).map((step) => step.nodeId),
    ).toEqual(["a", "b"]);
  });
});
