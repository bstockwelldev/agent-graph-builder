"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Play, ShieldAlert, Workflow } from "lucide-react";
import type { ChatRunRef, NodeTrace, RunSummary } from "@bstockwelldev/agent-graph-sdk";

import { Button } from "@/components/graph/ui/Button";
import { client, waitForRun } from "@/lib/api-client";
import { applyRunEvent, formatStepDuration, stepsFromTraces, type RunStep } from "@/lib/chatRuns";
import { isTerminalRunStatus, watchRunCompletion, type WaitForRun } from "@/lib/watchRun";
import {
  color,
  fontFamily,
  localType,
  radius,
  spacing,
  status as statusColor,
  surface,
  text,
  typeScale,
} from "@/lib/graph-theme";
import { JsonBlock, ToolStep } from "./tool-step";

export type RunCardDeps = {
  getRun: (runId: string) => Promise<RunSummary>;
  getRunNodeTraces: (runId: string) => Promise<NodeTrace[]>;
  /** SDK 2/7: `client.runs.wait` -- streams events and resolves when the run settles. */
  waitForRun: WaitForRun;
};

const DEFAULT_DEPS: RunCardDeps = {
  getRun: (runId) => client.runs.get(runId),
  getRunNodeTraces: (runId) => client.runs.traces(runId),
  waitForRun,
};

export function versionLabel(ref: Pick<ChatRunRef, "source" | "release_id" | "agent_name">): string {
  if (ref.agent_name) return `Agent ${ref.agent_name}`;
  return ref.source === "release" ? `Release ${ref.release_id ?? ""}`.trim() : "Draft";
}

const STATUS_COLOR: Record<string, string> = {
  queued: text.secondary,
  running: color.primary[500],
  succeeded: color.success[500],
  failed: color.error[500],
  paused: color.warning[500],
};

const cardStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: spacing[2],
  borderRadius: radius.lg,
  border: `1px solid ${surface.border}`,
  background: surface.card,
  padding: spacing[3],
  ...localType.ui,
  color: text.primary,
};

const rowStyle: CSSProperties = {
  display: "flex",
  minWidth: 0,
  alignItems: "center",
  gap: spacing[2],
};

const truncateStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pillStyle: CSSProperties = {
  flexShrink: 0,
  borderRadius: radius.xxl,
  background: surface.raised,
  border: `1px solid ${surface.border}`,
  padding: `2px ${spacing[1] + 2}px`,
  fontSize: 11,
  lineHeight: "16px",
  color: text.secondary,
};

/**
 * A graph run started from Chat (studio-ux-gap-remediation-plan.md §4-5,
 * STO-600/601). Streams the run's node events into one collapsed
 * `ToolStep` row per node -- the same event stream and completion watcher
 * the Run panel uses -- then swaps in the stored traces once it finishes.
 * `[View run]` / `[View flow]` hand off to the workspace.
 *
 * Token-styled (apps/studio/AGENTS.md): the chat panel lives on the
 * token-styled graph canvas, so it uses graph-theme tokens, not Tailwind.
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
    <div role="group" aria-label={`Run of ${runRef.graph_name}`} style={cardStyle}>
      <div style={rowStyle}>
        <Workflow aria-hidden style={{ width: 16, height: 16, flexShrink: 0, color: color.primary[500] }} />
        <span style={{ ...truncateStyle, ...typeScale.small, color: text.primary }}>{runRef.graph_name}</span>
        <span style={pillStyle}>{versionLabel(runRef)}</span>
        <span role="status" style={{ marginLeft: "auto", flexShrink: 0, fontWeight: 500, textTransform: "capitalize", color: STATUS_COLOR[status] ?? text.secondary }}>
          {status}
        </span>
      </div>
      <div style={{ ...rowStyle, flexWrap: "wrap", rowGap: spacing[1], color: text.secondary }}>
        {summary?.provider ? <span>env: {summary.provider}</span> : null}
        <span style={{ fontFamily: fontFamily.mono }}>{runRef.run_id}</span>
        {steps.length > 0 ? (
          <span role="img" aria-label={`${done} of ${steps.length} nodes done`} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: spacing[1] }}>
            {steps.map((step) => (
              <span
                key={step.nodeId}
                title={`${step.nodeId}: ${step.status}`}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background:
                    step.status === "succeeded"
                      ? statusColor.succeeded
                      : step.status === "failed"
                        ? statusColor.failed
                        : step.status === "paused"
                          ? statusColor.paused
                          : statusColor.running,
                }}
              />
            ))}
            <span style={{ marginLeft: spacing[1] }}>
              {done}/{steps.length}
            </span>
          </span>
        ) : null}
      </div>
      {Object.keys(runRef.input ?? {}).length > 0 ? (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: spacing[2], rowGap: 2, margin: 0 }}>
          {Object.entries(runRef.input).map(([key, value]) => (
            <div key={key} style={{ display: "contents" }}>
              <dt style={{ fontFamily: fontFamily.mono, color: text.secondary }}>{key}</dt>
              <dd style={{ ...truncateStyle, margin: 0 }}>{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {steps.length > 0 ? (
        <div role="group" aria-label="Run steps" style={{ display: "flex", flexDirection: "column", gap: spacing[1] }}>
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
      {summary?.status === "failed" && summary.error ? <p style={{ color: color.error[500], whiteSpace: "pre-wrap", margin: 0 }}>{summary.error}</p> : null}
      {error ? <p style={{ color: color.error[500], margin: 0 }}>{error}</p> : null}
      {(onViewRun || onViewFlow) && (
        <div style={{ display: "flex", gap: spacing[2], paddingTop: spacing[1], opacity: terminal ? 1 : 0.8 }}>
          {onViewRun ? (
            <Button type="button" variant="secondary" onClick={onViewRun} style={{ height: 28, fontSize: 12 }}>
              View run
            </Button>
          ) : null}
          {onViewFlow ? (
            <Button type="button" variant="ghost" onClick={onViewFlow} style={{ height: 28, fontSize: 12 }}>
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
    <div role="alertdialog" aria-label={`Confirm run of ${graphName}`} style={{ ...cardStyle, borderColor: color.warning[600] }}>
      <div style={rowStyle}>
        <ShieldAlert aria-hidden style={{ width: 16, height: 16, flexShrink: 0, color: color.warning[500] }} />
        <span style={{ ...truncateStyle, ...typeScale.small, color: text.primary }}>Run {graphName}?</span>
        <span style={{ ...pillStyle, marginLeft: "auto" }}>{version}</span>
      </div>
      <p style={{ color: text.secondary, margin: 0 }}>{reason}</p>
      {environment ? <p style={{ color: text.secondary, margin: 0 }}>env: {environment}</p> : null}
      {Object.keys(input).length > 0 ? (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: spacing[2], rowGap: 2, margin: 0 }}>
          {Object.entries(input).map(([key, value]) => (
            <div key={key} style={{ display: "contents" }}>
              <dt style={{ fontFamily: fontFamily.mono, color: text.secondary }}>{key}</dt>
              <dd style={{ ...truncateStyle, margin: 0 }}>
                {value || <span style={{ color: text.secondary, fontStyle: "italic" }}>empty</span>}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div style={{ display: "flex", gap: spacing[2] }}>
        <Button type="button" variant="primary" disabled={busy} onClick={onConfirm} style={{ height: 28, fontSize: 12 }}>
          <Play aria-hidden style={{ width: 14, height: 14 }} /> {busy ? "Starting…" : "Run"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel} style={{ height: 28, fontSize: 12 }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
