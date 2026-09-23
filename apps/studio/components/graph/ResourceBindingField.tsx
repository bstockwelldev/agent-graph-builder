"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, Library, PenLine } from "lucide-react";
import type { BindableResourceKind, Diagnostic } from "@bstockwelldev/agent-graph-sdk";
import { border, color, fontFamily, radius, spacing, surface, text } from "@/lib/graph-theme";
import { templateSegments } from "@/lib/templateEditor";
import { RESOURCE_NOUN, useBindableResources } from "./resourceBindings";
import { Combobox } from "./ui/Combobox";
import { Field, FieldIssues } from "./ui/Field";
import { IconButton } from "./ui/IconButton";
import { SegmentedControl } from "./ui/SegmentedControl";

type Mode = "inline" | "library";

/**
 * Inline ↔ Library source switch for one bindable node field
 * (studio-graph-workbench-redesign-plan.md, Wave 4a / STO-605).
 *
 * Inline renders `children` (the node's own editor, unchanged). Library
 * picks a registry resource -- a live reference the backend resolves at run
 * time and freezes on release -- shows a read-only preview of it, and
 * offers Open to edit it in the resource panel without leaving the canvas.
 * Switching back to Inline clears the reference; the inline value was never
 * touched, so it's still there.
 */
export function ResourceBindingField({
  kind,
  label,
  value,
  onChange,
  onOpen,
  issues = [],
  variables = [],
  children,
}: {
  kind: BindableResourceKind;
  /** What the field is, e.g. "Prompt template" -- names the switch and picker. */
  label: string;
  /** The bound resource id, or undefined/"" when inline. */
  value: string | undefined;
  onChange: (resourceId: string | undefined) => void;
  onOpen?: (kind: BindableResourceKind, resourceId: string) => void;
  /** Diagnostics for the binding field itself (e.g. UNRESOLVED_RESOURCE_BINDING). */
  issues?: Diagnostic[];
  /** Known template variables, for highlighting a bound prompt's preview. */
  variables?: readonly string[];
  children: ReactNode;
}) {
  const bound = Boolean(value);
  const [pickingLibrary, setPickingLibrary] = useState(bound);
  const mode: Mode = bound || pickingLibrary ? "library" : "inline";
  const { items, loaded } = useBindableResources(mode === "library" ? kind : null);
  const noun = RESOURCE_NOUN[kind];
  const selected = value ? items.find((item) => item.id === value) : undefined;
  const missing = Boolean(value) && loaded && !selected;

  return (
    <div>
      <div style={{ marginBottom: spacing[3] }}>
        <SegmentedControl<Mode>
          aria-label={`${label} source`}
          value={mode}
          onChange={(next) => {
            if (next === mode) return;
            setPickingLibrary(next === "library");
            if (next === "inline") onChange(undefined);
          }}
          options={[
            { value: "inline", label: <SegmentLabel icon={<PenLine size={13} />}>Inline</SegmentLabel>, title: `Write the ${label.toLowerCase()} on this node` },
            { value: "library", label: <SegmentLabel icon={<Library size={13} />}>Library</SegmentLabel>, title: `Use a saved ${noun} (live; frozen when you publish a release)` },
          ]}
        />
      </div>

      {mode === "inline" ? (
        <>
          {children}
          <FieldIssues issues={issues} />
        </>
      ) : (
        <>
          <Field
            label={`Library ${noun}`}
            hint={`Live reference: runs use this ${noun}'s current content, and publishing a release freezes it.`}
            meta={missing ? <span style={{ color: color.error[500] }}>Not found</span> : undefined}
            issues={issues}
          >
            {(id) => (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Combobox
                    id={id}
                    aria-label={`${label} (library ${noun})`}
                    value={value ?? ""}
                    loading={!loaded}
                    options={items.map((item) => ({
                      value: item.id,
                      label: item.name,
                      description: item.name !== item.id ? item.id : item.detail || undefined,
                    }))}
                    onChange={(next) => onChange(next || undefined)}
                    placeholder={`Choose a ${noun}…`}
                    searchPlaceholder={`Search ${noun}s…`}
                    emptyMessage={`No ${noun}s yet — create one under Resources.`}
                  />
                </div>
                {value && onOpen && (
                  <IconButton
                    label={`Open ${noun}`}
                    icon={<ExternalLink size={15} />}
                    onClick={() => onOpen(kind, value)}
                    style={{ width: 36, height: 36, border: `1px solid ${border.default}`, background: surface.card, flexShrink: 0 }}
                  />
                )}
              </div>
            )}
          </Field>
          {selected && <BoundPreview kind={kind} body={selected.body} detail={selected.detail} variables={variables} />}
        </>
      )}
    </div>
  );
}

function SegmentLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden="true" style={{ display: "inline-flex" }}>{icon}</span>
      {children}
    </span>
  );
}

/** Read-only view of what the bound resource will contribute to the run. */
function BoundPreview({
  kind,
  body,
  detail,
  variables,
}: {
  kind: BindableResourceKind;
  body?: string;
  detail: string;
  variables: readonly string[];
}) {
  if (kind !== "prompts") {
    return detail ? (
      <div aria-label="Bound resource preview" style={{ fontSize: 12, lineHeight: "18px", color: text.secondary, fontFamily: fontFamily.mono, marginBottom: spacing[2] }}>
        {detail}
      </div>
    ) : null;
  }
  return (
    <div
      aria-label="Bound prompt preview"
      style={{
        maxHeight: 180,
        overflowY: "auto",
        marginBottom: spacing[2],
        padding: "8px 10px",
        borderRadius: radius.lg,
        border: `1px dashed ${border.default}`,
        background: surface.inset,
        color: text.primary,
        fontFamily: fontFamily.mono,
        fontSize: 12.5,
        lineHeight: "20px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {templateSegments(body ?? "", variables).map((segment, index) =>
        segment.kind === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <mark
            key={index}
            data-kind={segment.kind}
            style={{
              color: segment.kind === "known" ? color.primary[500] : color.warning[500],
              background: segment.kind === "known" ? "rgba(143, 186, 255, 0.14)" : "rgba(232, 188, 74, 0.14)",
              borderRadius: 3,
            }}
          >
            {segment.text}
          </mark>
        ),
      )}
    </div>
  );
}
