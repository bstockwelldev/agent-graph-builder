"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronRight, CircleDashed, Loader2, PauseCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolStepStatus = "running" | "succeeded" | "failed" | "paused";

const STATUS_ICON: Record<ToolStepStatus, ReactNode> = {
  running: <Loader2 className="size-3.5 animate-spin text-sky-400" aria-hidden />,
  succeeded: <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden />,
  failed: <XCircle className="text-destructive size-3.5" aria-hidden />,
  paused: <PauseCircle className="size-3.5 text-amber-400" aria-hidden />,
};

/**
 * One tool call / execution step in a chat message
 * (studio-ux-gap-remediation-plan.md §5, STO-601): collapsed to a single
 * line by default -- `▸ <name> · <meta> · <status>` -- and expanding in
 * place to its input/output. Part of components/ai-elements (Vercel AI
 * Elements' "Tool" pattern), not a parallel chat component system.
 */
export function ToolStep({
  name,
  meta,
  status,
  input,
  output,
  error,
  actions,
  defaultOpen = false,
}: {
  name: string;
  /** Secondary text on the collapsed row, e.g. node type and duration. */
  meta?: string | null;
  status: ToolStepStatus;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  /** Links back into the workspace, e.g. "View run". */
  actions?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasDetail = input !== undefined || output !== undefined || Boolean(error) || Boolean(actions);
  return (
    <div className="rounded-md border border-border/60 bg-background/40 text-xs" data-state={open ? "open" : "closed"}>
      <button
        type="button"
        aria-expanded={open}
        disabled={!hasDetail}
        onClick={() => setOpen((value) => !value)}
        className="hover:bg-accent/50 focus-visible:ring-ring flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 disabled:cursor-default"
      >
        <ChevronRight className={cn("text-muted-foreground size-3.5 shrink-0 transition-transform", open && "rotate-90", !hasDetail && "opacity-0")} aria-hidden />
        {STATUS_ICON[status] ?? <CircleDashed className="size-3.5" aria-hidden />}
        <span className="min-w-0 truncate font-mono font-medium">{name}</span>
        {meta ? <span className="text-muted-foreground min-w-0 truncate">· {meta}</span> : null}
        <span className={cn("ml-auto shrink-0 capitalize", status === "failed" ? "text-destructive" : "text-muted-foreground")}>{status}</span>
      </button>
      {open && hasDetail ? (
        <div className="space-y-2 border-t border-border/60 px-2 py-2">
          {error ? <p className="text-destructive whitespace-pre-wrap">{error}</p> : null}
          {input !== undefined ? <JsonBlock label="Input" value={input} /> : null}
          {output !== undefined ? <JsonBlock label="Output" value={output} /> : null}
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

const COLLAPSED_CHARS = 1200;

export function formatJson(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * A payload view that can't blow out the chat panel: wraps long lines,
 * caps height with its own scroll, and truncates very large payloads
 * behind a "Show all" toggle (STO-601 AC: "scrollable/truncated with an
 * expand-further affordance").
 */
export function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const [full, setFull] = useState(false);
  const text = formatJson(value);
  const truncated = !full && text.length > COLLAPSED_CHARS;
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-muted-foreground flex items-center gap-2 text-[11px] font-medium tracking-wide uppercase">
        {label}
        {text.length > COLLAPSED_CHARS ? (
          <button type="button" className="text-primary ml-auto normal-case hover:underline" onClick={() => setFull((v) => !v)}>
            {full ? "Show less" : `Show all (${Math.round(text.length / 1000)}k chars)`}
          </button>
        ) : null}
      </div>
      <pre
        data-testid={`json-${label.toLowerCase()}`}
        className={cn(
          "bg-muted/60 overflow-auto rounded-md p-2 font-mono text-[11px] leading-4 break-words whitespace-pre-wrap",
          full ? "max-h-96" : "max-h-40",
        )}
      >
        {truncated ? `${text.slice(0, COLLAPSED_CHARS)}…` : text}
      </pre>
    </div>
  );
}
