"use client";

import { useEffect, useState } from "react";
import { Play, ShieldAlert, Workflow } from "lucide-react";
import type { ChatRunRef, NodeTrace, RunSummary } from "@bstockwelldev/agent-graph-sdk";

import { Button } from "@/components/ui/button";
import { client, waitForRun } from "@/lib/api-client";
import { applyRunEvent, formatStepDuration, stepsFromTraces, type RunStep } from "@/lib/chatRuns";
import { cn } from "@/lib/utils";
import { isTerminalRunStatus, watchRunCompletion, type WaitForRun } from "@/lib/watchRun";
import { JsonBlock, ToolStep } from "./tool-step";

export type RunCardDeps = {
  getRun: (runId: string) => Promise<RunSummary>;
  getRunNodeTraces: (runId: string) => Promise<NodeTrace[]>;
  /** SDK 2/7: `client.runs.wait` -- streams events and resolves when the run settles. */
  waitForRun: WaitForRun;
};

const DEFAULT_DEPS: RunCardDeps = {
  getRun: (runId) => client.getRun(runId),
  getRunNodeTraces: (runId) => client.getRunNodeTraces(runId),
  waitForRun,
};

export function versionLabel(ref: Pick<ChatRunRef, "source" | "release_id">): string {
  return ref.source === "release" ? `Release ${ref.release_id ?? ""}`.trim() : "Draft";
}

const STATUS_CLASS: Record<string, string> = {
  queued: "text-muted-foreground",
  running: "text-sky-400",
  succeeded: "text-emerald-400",
  failed: "text-destructive",
};

/**
 * A graph run started from Chat (studio-ux-gap-remediation-plan.md §4-5,
 * STO-600/601). Streams the run's node events into one collapsed
 * `ToolStep` row per node -- the same event stream and completion watcher
 * the Run panel uses -- then swaps in the stored traces once it finishes.
 * `[View run]` / `[View flow]` hand off to the workspace.
 */
export function RunCard({
  runRef,
  onViewRun,
  onViewFlow,
  deps = DEFAULT_DEPS,
}: {
  runRef: ChatRunRef;
  onViewRun?: () => void;
  onViewFlow?: () => void;
  deps?: RunCardDeps;
}) {
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stop: () => void = () => undefined;
    const settle = async (finished: RunSummary) => {
      if (cancelled) return;
      setSummary(finished);
      try {
        const traces = await deps.getRunNodeTraces(finished.run_id);
        if (!cancelled && traces.length > 0) setSteps(stepsFromTraces(traces));
      } catch {
        // Keep the streamed steps.
      }
    };
    deps
      .getRun(runRef.run_id)
      .then((initial) => {
        if (cancelled) return;
        setSummary(initial);
        if (isTerminalRunStatus(initial.status)) {
          void settle(initial);
          return;
        }
        stop = watchRunCompletion({
          initial,
          wait: deps.waitForRun,
          onEvent: (event) => {
            if (!cancelled) setSteps((current) => applyRunEvent(current, event));
          },
          onTerminal: (finished) => void settle(finished),
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [deps, runRef.run_id]);

  const status = summary?.status ?? "queued";
  const done = steps.filter((step) => step.status === "succeeded").length;
  const terminal = summary ? isTerminalRunStatus(summary.status) : false;

  return (
    <div aria-label={`Run of ${runRef.graph_name}`} role="group" className="bg-card w-full min-w-0 space-y-2 rounded-lg border p-3 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <Workflow className="text-primary size-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate text-sm font-semibold">{runRef.graph_name}</span>
        <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 text-[11px]">{versionLabel(runRef)}</span>
        <span className={cn("ml-auto shrink-0 font-medium capitalize", STATUS_CLASS[status])} role="status">
          {status}
        </span>
      </div>
      <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {summary?.provider ? <span>env: {summary.provider}</span> : null}
        <span className="font-mono">{runRef.run_id}</span>
        {steps.length > 0 ? (
          <span className="ml-auto flex items-center gap-1" aria-label={`${done} of ${steps.length} nodes done`}>
            {steps.map((step) => (
              <span
                key={step.nodeId}
                title={`${step.nodeId}: ${step.status}`}
                className={cn(
                  "size-1.5 rounded-full",
                  step.status === "succeeded" ? "bg-emerald-400" : step.status === "failed" ? "bg-destructive" : step.status === "paused" ? "bg-amber-400" : "animate-pulse bg-sky-400",
                )}
              />
            ))}
            <span className="ml-1">
              {done}/{steps.length}
            </span>
          </span>
        ) : null}
      </div>
      {Object.keys(runRef.input ?? {}).length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          {Object.entries(runRef.input).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground font-mono">{key}</dt>
              <dd className="min-w-0 truncate">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {steps.length > 0 ? (
        <div className="space-y-1" aria-label="Run steps">
          {steps.map((step) => (
            <ToolStep
              key={step.nodeId}
              name={step.nodeId}
              meta={[step.nodeType, formatStepDuration(step)].filter(Boolean).join(" · ") || null}
              status={step.status}
              input={step.status === "running" ? undefined : step.input}
              output={step.status === "running" ? undefined : step.output}
              error={step.error}
            />
          ))}
        </div>
      ) : null}
      {summary?.status === "succeeded" && summary.result !== undefined && summary.result !== null ? <JsonBlock label="Result" value={summary.result} /> : null}
      {summary?.status === "failed" && summary.error ? <p className="text-destructive whitespace-pre-wrap">{summary.error}</p> : null}
      {error ? <p className="text-destructive">{error}</p> : null}
      {(onViewRun || onViewFlow) && (
        <div className={cn("flex gap-2 pt-1", !terminal && "opacity-80")}>
          {onViewRun ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onViewRun}>
              View run
            </Button>
          ) : null}
          {onViewFlow ? (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onViewFlow}>
              View flow
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Explicit confirmation before Chat starts a run it wasn't directly told to
 * start without one (STO-600 product decision): every published-release
 * run, and every run proposed from free text. Nothing executes until Run.
 */
export function RunConfirmCard({
  graphName,
  version,
  environment,
  input,
  reason,
  busy = false,
  onConfirm,
  onCancel,
}: {
  graphName: string;
  version: string;
  environment?: string;
  input: Record<string, string>;
  reason: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" aria-label={`Confirm run of ${graphName}`} className="w-full min-w-0 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 shrink-0 text-amber-400" aria-hidden />
        <span className="min-w-0 truncate text-sm font-semibold">Run {graphName}?</span>
        <span className="bg-muted ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px]">{version}</span>
      </div>
      <p className="text-muted-foreground">{reason}</p>
      {environment ? <p className="text-muted-foreground">env: {environment}</p> : null}
      {Object.keys(input).length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          {Object.entries(input).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground font-mono">{key}</dt>
              <dd className="min-w-0 truncate">{value || <span className="text-muted-foreground italic">empty</span>}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="synth" className="h-7 text-xs" disabled={busy} onClick={onConfirm}>
          <Play className="size-3.5" aria-hidden /> {busy ? "Starting…" : "Run"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
