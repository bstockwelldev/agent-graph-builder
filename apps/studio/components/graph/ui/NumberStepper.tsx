"use client";

import { Minus, Plus } from "lucide-react";
import { border, control, radius, surface, text } from "@/lib/graph-theme";

/** Bounded integer input with −/+ buttons (Wave 2.5). */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  id,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  "aria-label"?: string;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const buttonStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: control.height.md,
    height: "100%",
    border: "none",
    background: "transparent",
    color: text.primary,
    cursor: "pointer",
  } as const;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "stretch",
        height: control.height.md,
        borderRadius: radius.lg,
        border: `1px solid ${border.default}`,
        background: surface.inset,
        overflow: "hidden",
      }}
    >
      <button type="button" aria-label="Decrease" className="agb-hoverable agb-focus-ring" disabled={value <= min} onClick={() => onChange(clamp(value - step))} style={{ ...buttonStyle, opacity: value <= min ? 0.4 : 1 }}>
        <Minus size={14} aria-hidden="true" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        role="spinbutton"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max === Number.MAX_SAFE_INTEGER ? undefined : max}
        aria-valuenow={value}
        value={value}
        min={min}
        max={max === Number.MAX_SAFE_INTEGER ? undefined : max}
        step={step}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(clamp(parsed));
        }}
        className="agb-focus-ring"
        style={{
          width: 56,
          textAlign: "center",
          border: "none",
          borderLeft: `1px solid ${border.subtle}`,
          borderRight: `1px solid ${border.subtle}`,
          background: "transparent",
          color: text.primary,
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          MozAppearance: "textfield",
        }}
      />
      <button type="button" aria-label="Increase" className="agb-hoverable agb-focus-ring" disabled={value >= max} onClick={() => onChange(clamp(value + step))} style={{ ...buttonStyle, opacity: value >= max ? 0.4 : 1 }}>
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
