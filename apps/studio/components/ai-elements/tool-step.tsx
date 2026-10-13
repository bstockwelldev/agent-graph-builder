"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { CheckCircle2, ChevronRight, CircleDashed, Loader2, PauseCircle, XCircle } from "lucide-react";
import {
  border,
  color,
  fontFamily,
  localType,
  radius,
  spacing,
  surface,
  text,
  typeScale,
} from "@/lib/graph-theme";

export type ToolStepStatus = "running" | "succeeded" | "failed" | "paused";

function StatusIcon({ status }: { status: ToolStepStatus }) {
  const style: CSSProperties = { width: 14, height: 14, flexShrink: 0 };
  switch (status) {
    case "running":
      return <Loader2 aria-hidden style={{ ...style, color: color.primary[500], animation: "agb-spin 1s linear infinite" }} />;
    case "succeeded":
      return <CheckCircle2 aria-hidden style={{ ...style, color: color.success[500] }} />;
    case "failed":
      return <XCircle aria-hidden style={{ ...style, color: color.error[500] }} />;
    case "paused":
      return <PauseCircle aria-hidden style={{ ...style, color: color.warning[500] }} />;
    default:
      return <CircleDashed aria-hidden style={{ ...style, color: text.secondary }} />;
  }
}

/**
 * One tool call / execution step in a chat message
 * (studio-ux-gap-remediation-plan.md §5, STO-601): collapsed to a single
 * line by default -- `▸ <name> · <meta> · <status>` -- and expanding in
 * place to its input/output. Part of components/ai-elements (Vercel AI
 * Elements' "Tool" pattern), not a parallel chat component system.
 *
 * Token-styled (apps/studio/AGENTS.md): the chat panel lives on the
 * token-styled graph canvas, so it uses graph-theme tokens, not Tailwind.
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
  const [hover, setHover] = useState(false);
  const hasDetail = input !== undefined || output !== undefined || Boolean(error) || Boolean(actions);
  return (
    <div
      data-state={open ? "open" : "closed"}
      style={{
        borderRadius: radius.md,
        border: `1px solid ${surface.border}`,
        background: surface.card,
        ...localType.ui,
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        disabled={!hasDetail}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex",
          width: "100%",
          minWidth: 0,
          alignItems: "center",
          gap: spacing[1] + spacing[2] / 2,
          borderRadius: radius.md,
          padding: `${spacing[1] + spacing[2] / 2}px ${spacing[2]}px`,
          textAlign: "left",
          background: hover && hasDetail ? surface.raised : "transparent",
          border: "none",
          cursor: hasDetail ? "pointer" : "default",
          color: text.primary,
          outline: "none",
        }}
      >
        <ChevronRight
          aria-hidden
          style={{
            width: 14,
            height: 14,
            flexShrink: 0,
            color: text.secondary,
            transform: open ? "rotate(90deg)" : undefined,
            transition: "transform 120ms",
            opacity: hasDetail ? 1 : 0,
          }}
        />
        <StatusIcon status={status} />
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: fontFamily.mono,
            fontWeight: 500,
          }}
        >
          {name}
        </span>
        {meta ? (
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: text.secondary }}>
            · {meta}
          </span>
        ) : null}
        <span
          style={{
            marginLeft: "auto",
            flexShrink: 0,
            textTransform: "capitalize",
            color: status === "failed" ? color.error[500] : text.secondary,
          }}
        >
          {status}
        </span>
      </button>
      {open && hasDetail ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: spacing[2],
            borderTop: `1px solid ${surface.border}`,
            padding: spacing[2],
          }}
        >
          {error ? <p style={{ color: color.error[500], whiteSpace: "pre-wrap", margin: 0 }}>{error}</p> : null}
          {input !== undefined ? <JsonBlock label="Input" value={input} /> : null}
          {output !== undefined ? <JsonBlock label="Output" value={output} /> : null}
          {actions ? <div style={{ display: "flex", flexWrap: "wrap", gap: spacing[2] }}>{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

const COLLAPSED_CHARS = 1200;
const COLLAPSED_MAX_HEIGHT = 160;
const EXPANDED_MAX_HEIGHT = 384;

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
  const [hoverToggle, setHoverToggle] = useState(false);
  const jsonText = formatJson(value);
  const truncated = !full && jsonText.length > COLLAPSED_CHARS;
  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: spacing[1] }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing[2],
          ...typeScale.caption,
          fontWeight: 500,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: text.secondary,
        }}
      >
        {label}
        {jsonText.length > COLLAPSED_CHARS ? (
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            onMouseEnter={() => setHoverToggle(true)}
            onMouseLeave={() => setHoverToggle(false)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: color.primary[500],
              textTransform: "none",
              textDecoration: hoverToggle ? "underline" : "none",
              ...typeScale.caption,
            }}
          >
            {full ? "Show less" : `Show all (${Math.round(jsonText.length / 1000)}k chars)`}
          </button>
        ) : null}
      </div>
      <pre
        data-testid={`json-${label.toLowerCase()}`}
        style={{
          overflow: "auto",
          borderRadius: radius.md,
          padding: spacing[2],
          fontFamily: fontFamily.mono,
          fontSize: 11,
          lineHeight: "16px",
          overflowWrap: "break-word",
          whiteSpace: "pre-wrap",
          background: surface.inset,
          border: `1px solid ${border.subtle}`,
          color: text.primary,
          margin: 0,
          maxHeight: full ? EXPANDED_MAX_HEIGHT : COLLAPSED_MAX_HEIGHT,
        }}
      >
        {truncated ? `${jsonText.slice(0, COLLAPSED_CHARS)}…` : jsonText}
      </pre>
    </div>
  );
}
