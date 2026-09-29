"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

import { asRows, displayValue, resolveValue, type GenuiData, type GenuiNode, type GenuiSurface as GenuiSurfaceData } from "@/lib/genui";
import { border, localType, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";

import { Button } from "./Button";
import { Select, TextInput } from "./fields";
import { GenuiChart } from "./genui/GenuiChart";
import { GenuiDiagram } from "./genui/GenuiDiagram";
import { GenuiDiff } from "./genui/GenuiDiff";
import { GenuiMarkdown } from "./genui/GenuiMarkdown";
import { GenuiTable } from "./genui/GenuiTable";

/** Input id -> the approver's answer (FormField, Select, Checkbox). */
export type GenuiValues = Record<string, string | number | boolean>;

type Ctx = {
  values: GenuiValues;
  onValuesChange?: (values: GenuiValues) => void;
  onAction?: (actionId: string) => void;
  disabled: boolean;
  /** The paused run's data for `$ref`s; null in previews without a run. */
  data: GenuiData | null;
};

/**
 * A human_gate's GenUI surface, token-styled for the graph editor: the Run
 * panel's checkpoint card, the inspector's live preview and the /genui
 * library all render through this one component.
 *
 * Interactive when `onValuesChange`/`onAction` are given: inputs are
 * editable and Buttons / Approval dispatch their action. Otherwise a
 * read-only preview. `data` resolves `{"$ref": "/nodes/<id>/output"}` props
 * (lib/genui.ts); without it a ref shows where it points.
 */
export function GenuiSurface({
  surface: surfaceData,
  values = {},
  onValuesChange,
  onAction,
  disabled = false,
  data = null,
}: {
  surface: GenuiSurfaceData;
  values?: GenuiValues;
  onValuesChange?: (values: GenuiValues) => void;
  onAction?: (actionId: string) => void;
  disabled?: boolean;
  data?: GenuiData | null;
}) {
  return (
    <div style={frameStyle}>
      <NodeView node={surfaceData.root} ctx={{ values, onValuesChange, onAction, disabled, data }} />
    </div>
  );
}

function NodeView({ node, ctx }: { node: GenuiNode; ctx: Ctx }): ReactNode {
  const children = (entries: GenuiNode[] | undefined, prefix: string) => (entries ?? []).map((entry, i) => <NodeView key={`${prefix}-${i}`} node={entry} ctx={ctx} />);
  const setValue = (id: string, value: string | number | boolean) => ctx.onValuesChange?.({ ...ctx.values, [id]: value });
  const editable = Boolean(ctx.onValuesChange);

  switch (node.type) {
    case "Stack": {
      const row = node.props?.direction === "row";
      return (
        <div style={{ display: "flex", flexDirection: row ? "row" : "column", flexWrap: row ? "wrap" : undefined, gap: node.props?.gap ?? spacing[2] }}>
          {children(node.children, "stack")}
        </div>
      );
    }
    case "Card":
      return (
        <div style={cardStyle}>
          {node.props?.title ? <div style={{ ...typeScale.small, color: text.primary, marginBottom: spacing[2] }}>{node.props.title}</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>{children(node.children, "card")}</div>
        </div>
      );
    case "Text":
      return (
        <Resolved value={node.props.content} ctx={ctx}>
          {(value) => <p style={{ margin: 0, ...localType.ui, color: text.primary, whiteSpace: "pre-wrap" }}>{displayValue(value)}</p>}
        </Resolved>
      );
    case "Markdown":
      return (
        <Resolved value={node.props.content} ctx={ctx}>
          {(value) => <GenuiMarkdown content={displayValue(value)} />}
        </Resolved>
      );
    case "Button": {
      const actionId = node.props.actionId;
      const interactive = Boolean(ctx.onAction && actionId);
      return (
        <Button
          type="button"
          variant={actionId === "reject" ? "destructive" : actionId === "approve" ? "primary" : "secondary"}
          disabled={ctx.disabled || !interactive}
          title={interactive ? undefined : "Preview only"}
          onClick={() => actionId && ctx.onAction?.(actionId)}
        >
          {node.props.label}
        </Button>
      );
    }
    case "Approval": {
      const interactive = Boolean(ctx.onAction);
      return (
        <div role="group" aria-label={node.props?.title ?? "Approval"} style={cardStyle}>
          {node.props?.title ? <div style={{ ...typeScale.small, color: text.primary }}>{node.props.title}</div> : null}
          {node.props?.summary !== undefined ? (
            <Resolved value={node.props.summary} ctx={ctx}>
              {(value) => <GenuiMarkdown content={displayValue(value)} />}
            </Resolved>
          ) : null}
          <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[2] }}>
            <Button type="button" variant="primary" disabled={ctx.disabled || !interactive} title={interactive ? undefined : "Preview only"} onClick={() => ctx.onAction?.("approve")}>
              {node.props?.approveLabel ?? "Approve"}
            </Button>
            <Button type="button" variant="destructive" disabled={ctx.disabled || !interactive} title={interactive ? undefined : "Preview only"} onClick={() => ctx.onAction?.("reject")}>
              {node.props?.rejectLabel ?? "Reject"}
            </Button>
          </div>
        </div>
      );
    }
    case "FormField": {
      const numeric = node.props.inputType === "number";
      const value = ctx.values[node.id];
      return (
        <Labelled label={node.props.label}>
          {(id) => (
            <TextInput
              id={id}
              type={numeric ? "number" : "text"}
              value={typeof value === "boolean" ? "" : (value ?? "")}
              readOnly={!editable}
              disabled={ctx.disabled}
              placeholder={editable ? node.props.placeholder : "Preview"}
              onChange={(event) => {
                const raw = event.target.value;
                setValue(node.id, numeric && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw);
              }}
            />
          )}
        </Labelled>
      );
    }
    case "Select": {
      const options = node.props.options.map((option) => (typeof option === "string" ? { value: option, label: option } : { value: option.value, label: option.label ?? option.value }));
      const value = ctx.values[node.id];
      return (
        <Labelled label={node.props.label}>
          {(id) => (
            <Select id={id} value={typeof value === "string" ? value : ""} disabled={ctx.disabled || !editable} onChange={(event) => setValue(node.id, event.target.value)}>
              <option value="" disabled>
                {editable ? "Choose…" : "Preview"}
              </option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Labelled>
      );
    }
    case "Checkbox":
      return <CheckboxView id={node.id} label={node.props.label} checked={ctx.values[node.id] === true} disabled={ctx.disabled || !editable} onChange={(checked) => setValue(node.id, checked)} />;
    case "Chart":
      return (
        <Resolved value={node.props.data} ctx={ctx}>
          {(value) => {
            const rows = asRows(value);
            return rows ? (
              <GenuiChart kind={node.props.kind} rows={rows} x={node.props.x} y={Array.isArray(node.props.y) ? node.props.y : [node.props.y]} title={node.props.title} height={node.props.height} />
            ) : (
              <Note>{node.props.title ? `${node.props.title}: ` : ""}chart data isn&apos;t a list of rows.</Note>
            );
          }}
        </Resolved>
      );
    case "Table":
      return (
        <Resolved value={node.props.rows} ctx={ctx}>
          {(value) => {
            const rows = asRows(value);
            return rows ? <GenuiTable rows={rows} columns={node.props.columns} caption={node.props.caption} /> : <Note>Table rows aren&apos;t a list of objects.</Note>;
          }}
        </Resolved>
      );
    case "KeyValue":
      return (
        <Resolved value={node.props.items} ctx={ctx}>
          {(value) => <KeyValueView items={value} title={node.props.title} />}
        </Resolved>
      );
    case "Diff": {
      const before = resolveValue(node.props.before, ctx.data);
      const after = resolveValue(node.props.after, ctx.data);
      const missing = before.missing ?? after.missing;
      return missing ? <RefPlaceholder pointer={missing} hasData={ctx.data !== null} /> : <GenuiDiff before={before.value} after={after.value} title={node.props.title} />;
    }
    case "Diagram":
      return (
        <Resolved value={node.props.source} ctx={ctx}>
          {(value) => <GenuiDiagram source={displayValue(value)} title={node.props.title} />}
        </Resolved>
      );
    default: {
      const unknown: never = node;
      return <pre style={{ ...typeScale.caption, color: text.secondary }}>{JSON.stringify(unknown)}</pre>;
    }
  }
}

/** Renders `children` with a prop's `$ref` resolved, or where it points. */
function Resolved({ value, ctx, children }: { value: unknown; ctx: Ctx; children: (value: unknown) => ReactNode }) {
  const resolved = resolveValue(value, ctx.data);
  return resolved.missing ? <RefPlaceholder pointer={resolved.missing} hasData={ctx.data !== null} /> : <>{children(resolved.value)}</>;
}

function RefPlaceholder({ pointer, hasData }: { pointer: string; hasData: boolean }) {
  return (
    <Note>
      <span aria-hidden="true">↳ </span>
      <code style={{ fontSize: 11 }}>{pointer}</code> {hasData ? "(not in this run yet)" : "(filled in from the run)"}
    </Note>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, padding: spacing[2], borderRadius: radius.md, border: `1px dashed ${border.subtle}`, ...typeScale.caption, color: text.secondary }}>{children}</p>;
}

function Labelled({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label htmlFor={id} style={{ ...typeScale.caption, color: text.secondary }}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function CheckboxView({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  const inputId = `${useId()}-${id}`;
  return (
    <label htmlFor={inputId} style={{ display: "inline-flex", alignItems: "center", gap: spacing[2], ...localType.ui, color: text.primary, cursor: disabled ? "default" : "pointer" }}>
      <input id={inputId} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} style={{ width: 16, height: 16, accentColor: "#6ea8fe" }} />
      {label}
    </label>
  );
}

function KeyValueView({ items, title }: { items: unknown; title?: string }) {
  let current = items;
  if (typeof current === "string") {
    try {
      current = JSON.parse(current);
    } catch {
      return <Note>Key/value items aren&apos;t an object or a list of {"{label, value}"}.</Note>;
    }
  }
  const pairs: { label: string; value: unknown }[] = Array.isArray(current)
    ? current.map((entry) => (entry && typeof entry === "object" && "label" in entry ? { label: String((entry as { label: unknown }).label), value: (entry as { value?: unknown }).value } : { label: "", value: entry }))
    : current && typeof current === "object"
      ? Object.entries(current as Record<string, unknown>).map(([label, value]) => ({ label, value }))
      : [];
  if (pairs.length === 0) return <Note>No key/value items.</Note>;
  return (
    <div>
      {title ? <div style={{ ...typeScale.small, color: text.primary, marginBottom: spacing[1] }}>{title}</div> : null}
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(80px, max-content) 1fr", gap: `4px ${spacing[3]}px`, margin: 0, ...typeScale.caption }}>
        {pairs.map((pair, index) => (
          <div key={index} style={{ display: "contents" }}>
            <dt style={{ color: text.secondary }}>{pair.label}</dt>
            <dd style={{ margin: 0, color: text.primary, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{displayValue(pair.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const frameStyle: CSSProperties = {
  padding: spacing[3],
  borderRadius: radius.lg,
  border: `1px solid ${border.subtle}`,
  background: surface.inset,
};

const cardStyle: CSSProperties = {
  padding: spacing[3],
  borderRadius: radius.md,
  border: `1px solid ${border.subtle}`,
  background: surface.card,
};
