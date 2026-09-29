"use client";

import type { CSSProperties } from "react";

import { displayValue } from "@/lib/genui";
import { border, radius, spacing, text, typeScale } from "@/lib/graph-theme";

type Column = string | { key: string; label?: string };

const cell: CSSProperties = { padding: "4px 8px", textAlign: "left", verticalAlign: "top", borderBottom: `1px solid ${border.subtle}` };

/** Rows as a table; columns default to every key the rows use, in order seen. */
export function GenuiTable({ rows, columns, caption }: { rows: Record<string, unknown>[]; columns?: Column[]; caption?: string }) {
  const keys: { key: string; label: string }[] = columns
    ? columns.map((column) => (typeof column === "string" ? { key: column, label: column } : { key: column.key, label: column.label ?? column.key }))
    : [...new Set(rows.flatMap((row) => Object.keys(row)))].map((key) => ({ key, label: key }));
  const numeric = (key: string) => rows.length > 0 && rows.every((row) => row[key] === undefined || typeof row[key] === "number");

  return (
    <div tabIndex={0} role="region" aria-label={caption ?? "Table"} className="agb-focus-ring" style={{ overflowX: "auto", maxHeight: 280, borderRadius: radius.md }}>
      <table style={{ width: "100%", borderCollapse: "collapse", ...typeScale.caption, color: text.primary }}>
        {caption ? <caption style={{ ...typeScale.small, textAlign: "left", color: text.primary, marginBottom: spacing[1] }}>{caption}</caption> : null}
        <thead>
          <tr>
            {keys.map(({ key, label }) => (
              <th key={key} scope="col" style={{ ...cell, color: text.secondary, fontWeight: 500, textAlign: numeric(key) ? "right" : "left" }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(1, keys.length)} style={{ ...cell, color: text.secondary }}>
                No rows.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index}>
                {keys.map(({ key }) => (
                  <td key={key} style={{ ...cell, textAlign: numeric(key) ? "right" : "left", whiteSpace: typeof row[key] === "object" ? "pre-wrap" : undefined }}>
                    {typeof row[key] === "number" ? (row[key] as number).toLocaleString() : displayValue(row[key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
