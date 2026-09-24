import type { NodeTrace, PlatformEvent } from "./types.js";

/**
 * Run steps (SDK 2/7, STO-615 -- moved from Studio's lib/chatRuns.ts): a
 * run's per-node progress, folded from streamed events while it runs and
 * read from its stored node traces once it's done.
 */

export type RunStep = {
  nodeId: string;
  nodeType?: string;
  status: "running" | "succeeded" | "failed" | "paused";
  startedAt?: string;
  completedAt?: string | null;
  input?: unknown;
  output?: unknown;
  error?: string | null;
};

/** Folds one streamed run event into the step list (node started/completed/failed). */
export function applyRunEvent(steps: readonly RunStep[], event: PlatformEvent): RunStep[] {
  if (!event.node_id) return [...steps];
  const nodeId = event.node_id;
  const existing = steps.find((step) => step.nodeId === nodeId);
  const upsert = (patch: Partial<RunStep>): RunStep[] =>
    existing
      ? steps.map((step) => (step.nodeId === nodeId ? { ...step, ...patch } : step))
      : [...steps, { nodeId, status: "running", ...patch }];
  switch (event.event_type) {
    case "node.started":
      return upsert({ status: "running", startedAt: event.occurred_at });
    case "node.completed":
      return upsert({ status: "succeeded", completedAt: event.occurred_at, input: event.payload.input, output: event.payload.output });
    case "node.failed":
      return upsert({ status: "failed", completedAt: event.occurred_at, error: String(event.payload.error ?? "failed") });
    case "node.paused":
      return upsert({ status: "paused" });
    default:
      return [...steps];
  }
}

/** The authoritative steps once a run has finished (its stored node traces). */
export function stepsFromTraces(traces: readonly NodeTrace[]): RunStep[] {
  return [...traces]
    .sort((a, b) => (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0))
    .map((trace) => ({
      nodeId: trace.node_id,
      nodeType: trace.node_type,
      status: trace.status === "running" ? "running" : trace.status === "failed" ? "failed" : trace.status === "paused" ? "paused" : "succeeded",
      startedAt: trace.started_at,
      completedAt: trace.completed_at,
      input: trace.input,
      output: trace.output,
      error: trace.error,
    }));
}

export function formatStepDuration(step: Pick<RunStep, "startedAt" | "completedAt">): string | null {
  if (!step.startedAt || !step.completedAt) return null;
  const ms = new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
