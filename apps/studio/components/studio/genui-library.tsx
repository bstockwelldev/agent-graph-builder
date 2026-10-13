"use client";

import { useState, type CSSProperties } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/graph/ui/Button";
import { Card } from "@/components/graph/ui/Card";
import { Chip } from "@/components/graph/ui/Chip";
import { GenuiSurface } from "@/components/graph/ui/GenuiSurface";
import { border, color, fontFamily, localType, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { GENUI_CATALOG, GENUI_PATTERN, SAMPLE_DATA, surfaceJson, type GenuiCatalogEntry } from "@/lib/genuiCatalog";

// Styled from the canvas tokens and the graph kit (canvas-styling-plan.md,
// PR 2). The props table stays local: it is the only table in the workbench.

function CopyJsonButton({ json, label }: { json: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      aria-label={`Copy ${label} JSON`}
      style={{ display: "inline-flex", alignItems: "center", gap: spacing[1] }}
      onClick={() =>
        void navigator.clipboard?.writeText(json).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => undefined,
        )
      }
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copied ? "Copied" : "Copy JSON"}
    </Button>
  );
}

function JsonBlock({ json, label }: { json: string; label: string }) {
  // Focusable so keyboard users can scroll it (max-h + overflow-auto).
  return (
    <pre
      tabIndex={0}
      role="region"
      aria-label={label}
      className="agb-focus-ring"
      style={{
        margin: 0,
        maxHeight: 224,
        overflow: "auto",
        padding: spacing[3],
        borderRadius: radius.lg,
        border: `1px solid ${border.default}`,
        background: surface.inset,
        color: text.primary,
        fontFamily: fontFamily.mono,
        fontSize: 11,
        lineHeight: "16px",
        whiteSpace: "pre-wrap",
      }}
    >
      {json}
    </pre>
  );
}

const cell: CSSProperties = { padding: `${spacing[1]}px ${spacing[2]}px`, borderBottom: `1px solid ${border.subtle}`, verticalAlign: "top", overflowWrap: "anywhere" };
const head: CSSProperties = { ...cell, ...localType.label, color: text.secondary, textAlign: "left", fontWeight: 400 };

function PropsTable({ entry }: { entry: GenuiCatalogEntry }) {
  return (
    // Focusable, so a table that overflows a narrow workbench panel can still be scrolled by keyboard.
    <div tabIndex={0} role="region" aria-label={`${entry.type} props table`} className="agb-focus-ring" style={{ overflowX: "auto" }}>
      <table aria-label={`${entry.type} props`} style={{ width: "100%", borderCollapse: "collapse", ...typeScale.caption, color: text.primary }}>
        <thead>
          <tr>
            <th style={head}>Prop</th>
            <th style={head}>Type</th>
            <th style={head}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {entry.props.map((prop) => (
            <tr key={prop.name}>
              <td style={{ ...cell, fontFamily: fontFamily.mono }}>
                {prop.name}
                {prop.required ? (
                  <Chip style={{ marginLeft: spacing[2], fontSize: 10 }}>required</Chip>
                ) : null}
              </td>
              <td style={{ ...cell, fontFamily: fontFamily.mono }}>{prop.type}</td>
              <td style={{ ...cell, color: text.secondary }}>{prop.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComponentCard({ entry }: { entry: GenuiCatalogEntry }) {
  const json = surfaceJson(entry.example);
  return (
    <Card id={`genui-${entry.type.toLowerCase()}`} titleId={`genui-${entry.type}-title`} title={<span style={{ fontFamily: fontFamily.mono }}>{entry.type}</span>} description={entry.summary}>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
        <GenuiSurface surface={{ root: entry.example }} data={SAMPLE_DATA} />
        <PropsTable entry={entry} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: spacing[2] }}>
          <span style={{ ...typeScale.caption, color: text.secondary }}>Example surface</span>
          <CopyJsonButton json={json} label={entry.type} />
        </div>
        <JsonBlock json={json} label={`${entry.type} example JSON`} />
      </div>
    </Card>
  );
}

/** The catalog body: a checkpoint pattern, then a card per component. */
export function GenuiLibrary() {
  const patternJson = surfaceJson(GENUI_PATTERN);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
      <nav aria-label="Components" style={{ display: "flex", flexWrap: "wrap", gap: spacing[2] }}>
        {GENUI_CATALOG.map((entry) => (
          <a
            key={entry.type}
            href={`#genui-${entry.type.toLowerCase()}`}
            className="agb-focus-ring"
            style={{ ...typeScale.caption, fontFamily: fontFamily.mono, color: color.primary[500], textDecoration: "none" }}
          >
            {entry.type}
          </a>
        ))}
      </nav>
      <Card
        title="Pattern · approval checkpoint"
        description="A summary from the run to approve, the numbers behind it, and the answers the next nodes need. Previews here use sample run data for their $refs."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
          <GenuiSurface surface={{ root: GENUI_PATTERN }} data={SAMPLE_DATA} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <CopyJsonButton json={patternJson} label="pattern" />
          </div>
          <JsonBlock json={patternJson} label="Pattern JSON" />
        </div>
      </Card>
      <section aria-label="Component reference" style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
        {GENUI_CATALOG.map((entry) => (
          <ComponentCard key={entry.type} entry={entry} />
        ))}
      </section>
    </div>
  );
}
