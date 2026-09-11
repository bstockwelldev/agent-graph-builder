import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Diagnostic, NodeTrace, PlatformEvent, RunSummary } from "../types";
import {
  INSPECTED_EVENT_LOG_EMPTY,
  INSPECT_LOAD_FAIL,
  LIVE_EVENT_LOG_EMPTY,
} from "../observePanel";
import { RunPanel } from "./RunPanel";

vi.mock("../api", () => ({
  api: {
    providerCredentials: vi.fn(async () => ({
      label: "API key",
      env_var: "GROQ_API_KEY",
      configured: false,
    })),
    listProviderModels: vi.fn(async () => ({
      provider: "stub",
      models: [],
      source: "fallback",
      cached: false,
      message: "",
    })),
  },
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const succeededRun: RunSummary = {
  run_id: "run-1",
  graph_id: "graph-1",
  status: "succeeded",
  result: "Groq answer that should grow without a 160px clipper.\n".repeat(8),
  started_at: "2026-09-10T12:00:00.000Z",
};

const selectedTrace: NodeTrace = {
  node_id: "router_1",
  node_type: "router",
  status: "succeeded",
  input: { question: "q" },
  output: { route: "yes" },
  started_at: "2026-09-10T12:00:00.000Z",
  completed_at: "2026-09-10T12:00:01.000Z",
};

const liveEvent: PlatformEvent = {
  event_type: "node.completed",
  run_id: "run-1",
  node_id: "router_1",
  occurred_at: "2026-09-10T12:00:01.000Z",
  sequence: 4,
  payload: {},
};

function renderPanel(overrides: Partial<Parameters<typeof RunPanel>[0]> = {}) {
  return render(
    <RunPanel
      graphId="graph-1"
      diagnostics={[]}
      onCompile={vi.fn()}
      onRun={vi.fn()}
      onDiagnosticClick={vi.fn()}
      runSummary={null}
      runHistory={[]}
      onSelectRun={vi.fn()}
      events={[]}
      selectedTrace={null}
      {...overrides}
    />,
  );
}

function overflowYValues(root: HTMLElement): string[] {
  return [root, ...root.querySelectorAll("*")].flatMap((node) => {
    if (!(node instanceof HTMLElement)) return [];
    return node.style.overflowY ? [node.style.overflowY] : [];
  });
}

function maxHeights(root: HTMLElement): string[] {
  return [root, ...root.querySelectorAll("*")].flatMap((node) => {
    if (!(node instanceof HTMLElement)) return [];
    return node.style.maxHeight ? [node.style.maxHeight] : [];
  });
}

describe("RunPanel Execute/Observe", () => {
  it("groups Execute before Observe and keeps Execute independent of the accordion", () => {
    renderPanel({ runSummary: succeededRun });
    const execute = screen.getByTestId("execute-group");
    const observe = screen.getByTestId("observe-group");
    expect(execute.compareDocumentPosition(observe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Execute" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Compile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("collapses diagnostics when the graph is ready", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Diagnostics" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("opens diagnostics by default when issues exist", () => {
    const diagnostics: Diagnostic[] = [
      { severity: "error", code: "graph.empty", message: "Graph has no nodes", blocking: true },
    ];
    renderPanel({ diagnostics });
    expect(screen.getByRole("button", { name: "Diagnostics" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps a single Observe scroller without nested 160px/200px clippers", () => {
    renderPanel({
      runSummary: succeededRun,
      selectedTrace,
      selectedNodeId: "router_1",
      events: [liveEvent],
      runHistory: [succeededRun],
    });

    const scroller = screen.getByTestId("observe-scroller");
    expect(scroller.style.overflowY).toBe("auto");
    expect(maxHeights(scroller)).toEqual([]);
    const autoRegions = overflowYValues(screen.getByTestId("observe-group")).filter((value) => value === "auto");
    expect(autoRegions).toEqual(["auto"]);
  });

  it("opens only one Observe section at a time", () => {
    renderPanel({ runSummary: succeededRun });
    const status = screen.getByRole("button", { name: "Run status" });
    const events = screen.getByRole("button", { name: "Event log" });
    expect(status.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(events);
    expect(events.getAttribute("aria-expanded")).toBe("true");
    expect(status.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows live empty copy and keeps the placeholder compact", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Event log" }));
    expect(screen.getByText(LIVE_EVENT_LOG_EMPTY)).toBeTruthy();
    expect(screen.queryByText(INSPECTED_EVENT_LOG_EMPTY)).toBeNull();
    const status = screen.getByText(LIVE_EVENT_LOG_EMPTY);
    expect(status.style.maxHeight).toBe("");
  });

  it("uses distinct copy for an inspected run without events", () => {
    renderPanel({
      runSummary: succeededRun,
      inspectionRunId: "run-1",
      events: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Event log" }));
    expect(screen.getByText(INSPECTED_EVENT_LOG_EMPTY)).toBeTruthy();
    expect(screen.queryByText(LIVE_EVENT_LOG_EMPTY)).toBeNull();
  });

  it("hydrates the event log from runSummary.events when live events are empty", () => {
    renderPanel({
      runSummary: { ...succeededRun, events: [liveEvent] },
      inspectionRunId: "run-1",
      events: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Event log" }));
    expect(screen.getByText(/node\.completed/)).toBeTruthy();
    expect(screen.queryByText(INSPECTED_EVENT_LOG_EMPTY)).toBeNull();
  });

  it("shows FetchFail copy instead of the empty event log sentence", () => {
    renderPanel({
      runSummary: succeededRun,
      inspectLoadError: true,
      onRetryInspect: vi.fn(),
    });
    expect(screen.getByRole("alert").textContent).toContain(INSPECT_LOAD_FAIL);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("lets the drawer body own scrolling", () => {
    renderPanel({ layout: "drawer", runSummary: succeededRun });
    expect(screen.getByTestId("observe-scroller").style.overflowY).toBe("visible");
  });

  it("pretty-prints object run results", () => {
    renderPanel({
      runSummary: { ...succeededRun, result: { answer: "indexed" } },
    });
    const block = screen.getByTestId("run-result-json");
    expect(block.textContent).toContain('"answer": "indexed"');
  });

  it("preserves multiline text run results", () => {
    renderPanel({ runSummary: succeededRun });
    const block = screen.getByTestId("run-result-text");
    expect(block.textContent).toContain("Groq answer");
    expect(block.style.whiteSpace).toBe("pre-wrap");
  });
});
