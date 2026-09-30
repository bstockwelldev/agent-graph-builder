"use client";

import { useId } from "react";
import type { Diagnostic } from "@bstockwelldev/agent-graph-sdk";

import { parseGenuiSurface, type GenuiNode } from "@/lib/genui";
import { GENUI_CATALOG, GENUI_PATTERN, surfaceJson } from "@/lib/genuiCatalog";
import { accentSurface, fontFamily, spacing, text, typeScale } from "@/lib/graph-theme";

import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { GenuiSurface } from "./ui/GenuiSurface";
import { Select, TextArea } from "./ui/fields";

const PATTERN = "__pattern__";

/**
 * Appends `example` to the surface in `raw`: into its root Stack, or
 * alongside its root in a new Stack. An empty or invalid surface is
 * replaced (the editor shows why it was invalid before you insert).
 */
export function insertExample(raw: string, example: GenuiNode): string {
  const { surface } = parseGenuiSurface(raw);
  if (!surface) return surfaceJson(example);
  const root = surface.root;
  const next: GenuiNode =
    root.type === "Stack" && (root.props?.direction ?? "col") === "col"
      ? { ...root, children: [...root.children, example] }
      : { type: "Stack", props: { gap: 16 }, children: [root, example] };
  return surfaceJson(next);
}

/**
 * The human_gate's surface editor (resource-forms-consistency-plan.md slice
 * 5, part 2): JSON with live validation against the GenUI schema, Format,
 * "Insert example" from the component catalog, and a live preview. `$ref`s
 * preview as where they point; the Run panel fills them from the run.
 */
export function GenuiSurfaceEditor({ value, onChange, issues = [] }: { value: string; onChange: (value: string) => void; issues?: Diagnostic[] }) {
  const exampleId = useId();
  const parsed = parseGenuiSurface(value);
  const formatted = parsed.surface ? JSON.stringify(JSON.parse(value), null, 2) : null;

  return (
    <>
      <Field label="GenUI surface (JSON)" hint="Optional UI shown at the checkpoint: a summary to approve, charts, tables, inputs. See /genui for every component." issues={issues}>
        {(id) => (
          <>
            <TextArea
              id={id}
              aria-invalid={parsed.error ? true : undefined}
              aria-describedby={parsed.error ? `${id}-error` : undefined}
              style={{ height: 160, fontFamily: fontFamily.mono, fontSize: 12 }}
              value={value}
              placeholder='{"root": {"type": "Approval", "props": {"title": "Ship it?"}}}'
              onChange={(event) => onChange(event.target.value)}
              spellCheck={false}
            />
            {parsed.error ? (
              <p id={`${id}-error`} role="alert" style={{ ...typeScale.caption, color: accentSurface.destructive.text, margin: `${spacing[1]}px 0 0` }}>
                {parsed.error}
              </p>
            ) : null}
          </>
        )}
      </Field>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: spacing[2], marginTop: -spacing[2], marginBottom: spacing[3] }}>
        <label htmlFor={exampleId} style={{ ...typeScale.caption, color: text.secondary }}>
          Insert example
        </label>
        <Select
          id={exampleId}
          value=""
          style={{ width: "auto", flex: "1 1 140px" }}
          onChange={(event) => {
            const choice = event.target.value;
            const example = choice === PATTERN ? GENUI_PATTERN : GENUI_CATALOG.find((entry) => entry.type === choice)?.example;
            if (example) onChange(insertExample(value, example));
          }}
        >
          <option value="" disabled>
            Choose a component…
          </option>
          <option value={PATTERN}>Approval checkpoint (pattern)</option>
          {GENUI_CATALOG.map((entry) => (
            <option key={entry.type} value={entry.type}>
              {entry.type}
            </option>
          ))}
        </Select>
        <Button type="button" variant="secondary" disabled={formatted === null || formatted === value} onClick={() => formatted && onChange(formatted)}>
          Format
        </Button>
      </div>
      {parsed.surface ? (
        <Field label="Live preview">
          <GenuiSurface surface={parsed.surface} />
        </Field>
      ) : null}
    </>
  );
}
