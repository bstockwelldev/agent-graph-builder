"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { border, color, radius, text } from "@/lib/graph-theme";

export type IconTab = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Badge count; hidden when 0 or undefined. */
  count?: number;
  countTone?: "neutral" | "warning" | "error";
  /** Render the label only to assistive tech (icon-only tab). */
  iconOnly?: boolean;
};

/**
 * Icon + label tab strip with count badges (Wave 2.5). Replaces the
 * text-only `Tabs` in the node inspector and the stacked Observe
 * accordions in the run console. Arrow keys move between tabs (WAI-ARIA
 * tabs pattern, automatic activation). Scrolls horizontally if it can't fit.
 */
export function IconTabs({
  tabs,
  activeId,
  onChange,
  "aria-label": ariaLabel,
  idPrefix,
}: {
  tabs: IconTab[];
  activeId: string;
  onChange: (id: string) => void;
  "aria-label": string;
  /** When set, tabs get ids `${idPrefix}-tab-${id}` and control `${idPrefix}-panel-${id}`. */
  idPrefix?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: 2,
        overflowX: "auto",
        scrollbarWidth: "none",
        borderBottom: `1px solid ${border.subtle}`,
      }}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        const badgeTone =
          tab.countTone === "error" ? color.error[500] : tab.countTone === "warning" ? color.warning[500] : text.secondary;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${tab.id}` : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={tab.iconOnly ? tab.label : undefined}
            title={tab.iconOnly ? tab.label : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="agb-focus-ring agb-hoverable"
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 8px",
              marginBottom: -1,
              border: "none",
              borderBottom: `2px solid ${active ? color.primary[500] : "transparent"}`,
              borderRadius: `${radius.md}px ${radius.md}px 0 0`,
              background: "transparent",
              color: active ? text.primary : text.secondary,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <span aria-hidden="true" style={{ display: "inline-flex", color: active ? color.primary[500] : "inherit" }}>
              {tab.icon}
            </span>
            {!tab.iconOnly && tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                aria-label={`${tab.count}`}
                style={{
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  color: badgeTone,
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: "16px",
                  textAlign: "center",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
