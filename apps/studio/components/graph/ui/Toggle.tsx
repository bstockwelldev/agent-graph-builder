"use client";

import { useId, type ReactNode } from "react";
import { border, color, shell, surface, text } from "@/lib/graph-theme";

/** Switch for boolean config (Wave 2.5) -- replaces yes/no selects. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="agb-focus-ring"
        style={{
          position: "relative",
          flexShrink: 0,
          width: 36,
          height: 20,
          marginTop: 1,
          borderRadius: 999,
          border: `1px solid ${checked ? color.primary[600] : border.default}`,
          background: checked ? color.primary[700] : surface.inset,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition: `background ${shell.motion.fast}ms, border-color ${shell.motion.fast}ms`,
          padding: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: checked ? "#ffffff" : text.secondary,
            transition: `left ${shell.motion.fast}ms ${shell.motion.easing}`,
          }}
        />
      </button>
      <label htmlFor={id} style={{ cursor: disabled ? "default" : "pointer", minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, lineHeight: "20px", color: text.primary }}>{label}</span>
        {description && (
          <span id={`${id}-desc`} style={{ display: "block", fontSize: 12, lineHeight: "16px", color: text.secondary }}>
            {description}
          </span>
        )}
      </label>
    </div>
  );
}
