"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { border, color, control, radius, shadow, shell, spacing, surface, text } from "@/lib/graph-theme";

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  group?: string;
  disabled?: boolean;
};

/** Case-insensitive match on label, value, and description. Exported for tests. */
export function filterComboboxOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((option) =>
    [option.label, option.value, option.description ?? ""].some((field) => field.toLowerCase().includes(q)),
  );
}

/**
 * Searchable select for the graph kit (Wave 2.5) -- replaces native
 * `<select>`s for provider, model, tool, and similar lists. A button trigger
 * showing the current option (icon + label); the popover has a search box and
 * a grouped listbox with keyboard support (↑/↓/Home/End/Enter/Escape).
 * `allowCustom` lets the typed query be committed as a free value (e.g. a
 * model id not in the catalog).
 */
export function Combobox({
  value,
  options,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  allowCustom = false,
  disabled = false,
  loading = false,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => filterComboboxOptions(options, query), [options, query]);
  const customValue = allowCustom && query.trim() && !options.some((o) => o.value === query.trim()) ? query.trim() : null;
  const itemCount = filtered.length + (customValue ? 1 : 0);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.max(rect.width, 220);
    const estimatedHeight = 320;
    const below = rect.bottom + 4;
    const top = below + estimatedHeight > window.innerHeight - 8 ? Math.max(8, rect.top - estimatedHeight - 4) : below;
    setPosition({ top, left: Math.min(rect.left, window.innerWidth - width - 8), width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, filtered.findIndex((option) => option.value === value)));
    searchRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on open only
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };

  const commit = (index: number) => {
    if (index < filtered.length) {
      const option = filtered[index];
      if (option.disabled) return;
      onChange(option.value);
    } else if (customValue) {
      onChange(customValue);
    }
    close();
  };

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="agb-field"
        style={triggerStyle(disabled)}
      >
        {selected?.icon && <span style={{ display: "inline-flex", flexShrink: 0 }} aria-hidden="true">{selected.icon}</span>}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", color: selected || value ? text.primary : text.secondary }}>
          {loading ? "Loading…" : selected?.label ?? (value || placeholder)}
        </span>
        <ChevronDown size={14} aria-hidden="true" style={{ flexShrink: 0, color: text.secondary }} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div onMouseDown={() => close(false)} style={{ position: "fixed", inset: 0, zIndex: shell.zIndex.tooltip }} aria-hidden="true" />
            <div style={{ ...popoverStyle, top: position?.top ?? -9999, left: position?.left ?? -9999, width: position?.width ?? 240 }}>
              <div style={{ position: "relative", padding: spacing[2], borderBottom: `1px solid ${border.subtle}` }}>
                <Search size={14} aria-hidden="true" style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: text.secondary }} />
                <input
                  ref={searchRef}
                  role="searchbox"
                  aria-label={searchPlaceholder}
                  aria-controls={listboxId}
                  aria-activedescendant={itemCount ? `${listboxId}-${activeIndex}` : undefined}
                  value={query}
                  placeholder={searchPlaceholder}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveIndex((i) => Math.min(itemCount - 1, i + 1));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((i) => Math.max(0, i - 1));
                    } else if (event.key === "Home") {
                      setActiveIndex(0);
                    } else if (event.key === "End") {
                      setActiveIndex(Math.max(0, itemCount - 1));
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      if (itemCount) commit(activeIndex);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      close();
                    } else if (event.key === "Tab") {
                      close(false);
                    }
                  }}
                  className="agb-field"
                  style={{ width: "100%", boxSizing: "border-box", height: control.height.sm + 2, padding: "0 8px 0 28px", borderRadius: radius.md, border: `1px solid ${border.default}`, background: surface.inset, color: text.primary, fontSize: 13 }}
                />
              </div>
              <ul id={listboxId} role="listbox" aria-label={ariaLabel} style={{ listStyle: "none", margin: 0, padding: 4, maxHeight: 260, overflowY: "auto" }}>
                {filtered.map((option, index) => {
                  const showGroup = option.group && option.group !== lastGroup;
                  lastGroup = option.group;
                  const active = index === activeIndex;
                  const isSelected = option.value === value;
                  return (
                    <li key={option.value} role="presentation">
                      {showGroup && <div style={groupStyle}>{option.group}</div>}
                      <div
                        id={`${listboxId}-${index}`}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          commit(index);
                        }}
                        style={optionStyle(active, option.disabled)}
                      >
                        {option.icon && <span style={{ display: "inline-flex", flexShrink: 0 }} aria-hidden="true">{option.icon}</span>}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{option.label}</span>
                          {option.description && <span style={{ display: "block", fontSize: 11, color: text.secondary }}>{option.description}</span>}
                        </span>
                        {isSelected && <Check size={14} aria-hidden="true" style={{ color: color.primary[500], flexShrink: 0 }} />}
                      </div>
                    </li>
                  );
                })}
                {customValue && (
                  <li role="presentation">
                    <div
                      id={`${listboxId}-${filtered.length}`}
                      role="option"
                      aria-selected={false}
                      onMouseEnter={() => setActiveIndex(filtered.length)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        commit(filtered.length);
                      }}
                      style={optionStyle(activeIndex === filtered.length)}
                    >
                      Use “{customValue}”
                    </div>
                  </li>
                )}
                {itemCount === 0 && <li style={{ padding: "8px 10px", fontSize: 12, color: text.secondary }}>{emptyMessage}</li>}
              </ul>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function triggerStyle(disabled: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minHeight: control.height.md,
    padding: "0 10px",
    boxSizing: "border-box",
    borderRadius: radius.lg,
    border: `1px solid ${border.default}`,
    background: surface.inset,
    color: text.primary,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

const popoverStyle: CSSProperties = {
  position: "fixed",
  zIndex: shell.zIndex.tooltip + 1,
  borderRadius: radius.lg,
  border: `1px solid ${border.default}`,
  background: surface.panel,
  boxShadow: shadow[8],
  overflow: "hidden",
};

const groupStyle: CSSProperties = {
  padding: "8px 10px 4px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: text.secondary,
};

function optionStyle(active: boolean, disabled?: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: radius.md,
    fontSize: 13,
    color: disabled ? text.secondary : text.primary,
    background: active ? "rgba(143, 186, 255, 0.14)" : "transparent",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
