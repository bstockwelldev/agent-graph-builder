"use client";

import type { CSSProperties } from "react";

import type { GenuiNode, GenuiSurface as GenuiSurfaceData } from "@/lib/genui";
import { border, localType, radius, spacing, surface, text, typeScale } from "@/lib/graph-theme";

import { Button } from "./Button";
import { TextInput } from "./fields";

/** FormField id -> the value the approver typed. */
export type GenuiValues = Record<string, string | number>;

/**
 * A human_gate's GenUI surface, token-styled for the graph editor (the Run
 * panel's checkpoint card and the inspector's live preview). The shadcn
 * renderer in components/genui/ stays for the /genui library page.
 *
 * Interactive when `onValuesChange`/`onAction` are given: FormFields are
 * editable and Buttons dispatch their `actionId`. Otherwise a read-only
 * preview.
 */
export function GenuiSurface({
  surface: data,
  values = {},
  onValuesChange,
  onAction,
  disabled = false,
}: {
  surface: GenuiSurfaceData;
  values?: GenuiValues;
  onValuesChange?: (values: GenuiValues) => void;
  onAction?: (actionId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={frameStyle}>
      <GenuiNodeView node={data.root} values={values} onValuesChange={onValuesChange} onAction={onAction} disabled={disabled} />
    </div>
  );
}

function GenuiNodeView({
  node,
  values,
  onValuesChange,
  onAction,
  disabled,
}: {
  node: GenuiNode;
  values: GenuiValues;
  onValuesChange?: (values: GenuiValues) => void;
  onAction?: (actionId: string) => void;
  disabled: boolean;
}) {
  const child = (entry: GenuiNode, key: string) => (
    <GenuiNodeView key={key} node={entry} values={values} onValuesChange={onValuesChange} onAction={onAction} disabled={disabled} />
  );
  switch (node.type) {
    case "Stack": {
      const row = node.props?.direction === "row";
      return (
        <div style={{ display: "flex", flexDirection: row ? "row" : "column", flexWrap: row ? "wrap" : undefined, gap: node.props?.gap ?? spacing[2] }}>
          {node.children.map((entry, i) => child(entry, `stack-${i}`))}
        </div>
      );
    }
    case "Text":
      return <p style={{ margin: 0, ...localType.ui, color: text.primary }}>{node.props.content}</p>;
    case "Button": {
      const actionId = node.props.actionId;
      const interactive = Boolean(onAction && actionId);
      return (
        <Button
          type="button"
          variant={actionId === "reject" ? "destructive" : actionId === "approve" ? "primary" : "secondary"}
          disabled={disabled || !interactive}
          title={interactive ? undefined : "Preview only"}
          onClick={() => actionId && onAction?.(actionId)}
        >
          {node.props.label}
        </Button>
      );
    }
    case "Card":
      return (
        <div style={cardStyle}>
          {node.props?.title ? <div style={{ ...typeScale.small, color: text.primary, marginBottom: spacing[2] }}>{node.props.title}</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>{(node.children ?? []).map((entry, i) => child(entry, `card-${i}`))}</div>
        </div>
      );
    case "FormField": {
      const numeric = node.props.inputType === "number";
      const editable = Boolean(onValuesChange);
      const value = values[node.id];
      return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...typeScale.caption, color: text.secondary }}>{node.props.label}</span>
          <TextInput
            type={numeric ? "number" : "text"}
            value={value ?? ""}
            readOnly={!editable}
            disabled={disabled}
            placeholder={editable ? undefined : "Preview"}
            onChange={(event) => {
              const raw = event.target.value;
              const next = numeric && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
              onValuesChange?.({ ...values, [node.id]: next });
            }}
          />
        </label>
      );
    }
    default: {
      const unknown: never = node;
      return <pre style={{ ...typeScale.caption, color: text.secondary }}>{JSON.stringify(unknown)}</pre>;
    }
  }
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
