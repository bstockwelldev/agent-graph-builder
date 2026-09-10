import { describe, expect, it } from "vitest";

import { tracesFromEvents } from "./runInspection";
import type { PlatformEvent } from "./types";

const events: PlatformEvent[] = [
  {
    event_type: "node.started",
    run_id: "run-1",
    node_id: "llm-1",
    occurred_at: "2026-09-10T16:21:47.000Z",
    sequence: 1,
    payload: { nodeType: "llm" },
  },
  {
    event_type: "node.completed",
    run_id: "run-1",
    node_id: "llm-1",
    occurred_at: "2026-09-10T16:21:48.000Z",
    sequence: 2,
    payload: { nodeType: "llm", input: "q", output: "groq answer" },
  },
];

describe("tracesFromEvents", () => {
  it("rebuilds succeeded traces from a POST event log", () => {
    const traces = tracesFromEvents(events);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      node_id: "llm-1",
      node_type: "llm",
      status: "succeeded",
      input: "q",
      output: "groq answer",
      started_at: "2026-09-10T16:21:47.000Z",
      completed_at: "2026-09-10T16:21:48.000Z",
    });
  });

  it("returns an empty list when events have no node payloads", () => {
    expect(
      tracesFromEvents([
        {
          event_type: "run.completed",
          run_id: "run-1",
          occurred_at: "2026-09-10T16:21:48.000Z",
          sequence: 3,
          payload: { result: "ok" },
        },
      ]),
    ).toEqual([]);
  });
});
