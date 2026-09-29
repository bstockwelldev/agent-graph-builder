"use client";

import { displayValue } from "@/lib/genui";
import { fontFamily, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";

export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

const MAX_LINES = 400;

/** Line diff (longest common subsequence), for "approve this change" views. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n").slice(0, MAX_LINES);
  const b = after.split("\n").slice(0, MAX_LINES);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ kind: "removed", text: a[i++] });
    } else {
      lines.push({ kind: "added", text: b[j++] });
    }
  }
  while (i < a.length) lines.push({ kind: "removed", text: a[i++] });
  while (j < b.length) lines.push({ kind: "added", text: b[j++] });
  return lines;
}

// Added/removed carry a +/- sign as well as a tint, so the change never
// relies on colour alone.
const STYLE = {
  same: { sign: " ", background: "transparent", color: text.secondary },
  added: { sign: "+", background: "#1f3a2a", color: text.primary },
  removed: { sign: "-", background: "#3a1f22", color: text.primary },
} as const;

export function GenuiDiff({ before, after, title }: { before: unknown; after: unknown; title?: string }) {
  const lines = diffLines(displayValue(before), displayValue(after));
  const added = lines.filter((line) => line.kind === "added").length;
  const removed = lines.filter((line) => line.kind === "removed").length;
  return (
    <div>
      <div style={{ display: "flex", gap: spacing[2], alignItems: "baseline", marginBottom: spacing[1] }}>
        {title ? <span style={{ ...typeScale.small, color: text.primary }}>{title}</span> : null}
        <span style={{ ...typeScale.caption, color: text.secondary }}>
          {added} added · {removed} removed
        </span>
      </div>
      <pre
        tabIndex={0}
        aria-label={title ?? "Changes"}
        className="agb-focus-ring"
        style={{ margin: 0, maxHeight: 280, overflow: "auto", borderRadius: radius.md, background: surface.page, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: "18px" }}
      >
        {lines.map((line, index) => (
          <div key={index} style={{ background: STYLE[line.kind].background, color: STYLE[line.kind].color, padding: "0 8px", whiteSpace: "pre-wrap" }}>
            <span aria-hidden="true">{STYLE[line.kind].sign} </span>
            <span className="sr-only">{line.kind === "same" ? "" : `${line.kind}: `}</span>
            {line.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
