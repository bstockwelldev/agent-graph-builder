"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { border, color, control, radius, shell, surface, text } from "@/lib/graph-theme";

export type SegmentOption<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; title?: string };

/** Radio group styled as segments (Wave 2.5) -- for small mutually
 * exclusive choices (edge kind, code language) instead of a select. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        width: "100%",
        padding: 3,
        gap: 3,
        borderRadius: radius.lg,
        border: `1px solid ${border.default}`,
        background: surface.inset,
        boxSizing: "border-box",
      }}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={option.title}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={active ? "agb-focus-ring" : "agb-focus-ring agb-hoverable"}
            style={{
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              minHeight: control.height.sm,
              padding: "0 8px",
              borderRadius: radius.md + 2,
              border: "none",
              background: active ? color.primary[800] : "transparent",
              color: active ? "#ffffff" : text.muted,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: `background ${shell.motion.fast}ms`,
            }}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
