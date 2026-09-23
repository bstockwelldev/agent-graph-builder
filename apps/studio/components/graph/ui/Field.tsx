"use client";

import { useId, type ReactNode } from "react";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import type { Diagnostic } from "@bstockwelldev/agent-graph-sdk";
import { color, spacing, text } from "@/lib/graph-theme";
import { HoverTooltip } from "./HoverTooltip";

/**
 * Labeled form row for the graph kit (studio-graph-workbench-redesign-plan.md,
 * Wave 2.5 "Inspector & Run console v2"). Label + optional hint glyph on the
 * left, optional meta (e.g. a character count) on the right, the control,
 * then any diagnostics that concern this field inline beneath it -- instead
 * of every issue piling up in one list above the tabs.
 *
 * `children` may be a render function receiving the generated control id,
 * so the label is programmatically associated (`htmlFor`).
 */
export function Field({
  label,
  hint,
  meta,
  issues = [],
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  meta?: ReactNode;
  issues?: Diagnostic[];
  children: ReactNode | ((id: string) => ReactNode);
  htmlFor?: string;
}) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  return (
    <div style={{ marginBottom: spacing[3] }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6, minHeight: 18 }}>
        <label htmlFor={id} style={{ fontSize: 12, lineHeight: "16px", fontWeight: 600, color: text.muted }}>
          {label}
        </label>
        {hint && (
          <HoverTooltip content={hint} placement="top" describe>
            <span tabIndex={0} aria-label="More info" className="agb-focus-ring" style={{ display: "inline-flex", color: text.secondary, borderRadius: 999 }}>
              <Info size={13} aria-hidden="true" />
            </span>
          </HoverTooltip>
        )}
        {meta && <span style={{ marginLeft: "auto", fontSize: 11, color: text.secondary }}>{meta}</span>}
      </div>
      {typeof children === "function" ? children(id) : children}
      {issues.length > 0 && <FieldIssues issues={issues} />}
    </div>
  );
}

export function FieldIssues({ issues }: { issues: Diagnostic[] }) {
  return (
    <ul role="list" aria-label="Issues for this field" style={{ listStyle: "none", margin: `${spacing[1]}px 0 0`, padding: 0 }}>
      {issues.map((issue, index) => {
        const tone = issue.severity === "error" ? color.error[500] : color.warning[500];
        const Icon = issue.severity === "error" ? XCircle : AlertTriangle;
        return (
          <li key={`${issue.code}-${index}`} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, lineHeight: "16px", color: tone, marginTop: 2 }}>
            <Icon size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {issue.message}
              {issue.remediation && <span style={{ display: "block", color: text.secondary }}>{issue.remediation}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
