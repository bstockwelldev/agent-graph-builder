"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Braces, Maximize2, X } from "lucide-react";
import { border, color, radius, shadow, shell, spacing, surface, text } from "@/lib/graph-theme";
import {
  insertPlaceholder,
  openPlaceholderAt,
  suggestPlaceholders,
  templateSegments,
} from "@/lib/templateEditor";
import { IconButton } from "./IconButton";

const FONT: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12.5,
  lineHeight: "20px",
  letterSpacing: 0,
  padding: "8px 10px",
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
  wordBreak: "break-word",
  tabSize: 2,
};

/**
 * Prompt/template editor (studio-graph-workbench-redesign-plan.md, Wave 2.5).
 * A transparent textarea over a mirrored backdrop that colours `{variable}`
 * tokens -- known ones in the accent colour, unknown ones in the warning
 * colour -- plus `{` autocomplete from `variables`, and an expand button
 * that opens the same editor large. No editor dependency.
 */
export function TemplateEditor({
  value,
  onChange,
  variables = [],
  rows = 4,
  placeholder,
  id,
  "aria-label": ariaLabel,
  onSubmit,
  expandable = true,
  title,
  plain = false,
}: {
  value: string;
  onChange: (value: string) => void;
  variables?: readonly string[];
  rows?: number;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  /** ⌘/Ctrl+Enter handler (e.g. "run"). */
  onSubmit?: () => void;
  expandable?: boolean;
  /** Title of the expanded editor dialog. */
  title?: string;
  /** Free text, not a template: no `{var}` highlighting or autocomplete,
   * proportional font (the run console's input fields). */
  plain?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <EditorSurface
        value={value}
        onChange={onChange}
        variables={variables}
        rows={rows}
        placeholder={placeholder}
        id={id}
        ariaLabel={ariaLabel}
        onSubmit={onSubmit}
        plain={plain}
        onExpand={expandable ? () => setExpanded(true) : undefined}
      />
      {expanded &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title ?? ariaLabel ?? "Edit template"}
            onKeyDown={(event) => {
              if (event.key === "Escape") setExpanded(false);
            }}
            style={{ position: "fixed", inset: 0, zIndex: shell.zIndex.drawer + 5, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(5, 7, 10, 0.6)", padding: spacing[4] }}
          >
            <div style={{ width: "min(880px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: spacing[2], padding: spacing[4], borderRadius: radius.xl, border: `1px solid ${border.default}`, background: surface.panel, boxShadow: shadow[8] }}>
              <div style={{ display: "flex", alignItems: "center", gap: spacing[2] }}>
                <Braces size={16} aria-hidden="true" style={{ color: color.primary[500] }} />
                <div style={{ fontWeight: 600, flex: 1 }}>{title ?? ariaLabel ?? "Edit template"}</div>
                <span style={{ fontSize: 12, color: text.secondary }}>{value.length} chars</span>
                <IconButton label="Close editor" icon={<X size={16} />} onClick={() => setExpanded(false)} />
              </div>
              <EditorSurface value={value} onChange={onChange} variables={variables} rows={22} placeholder={placeholder} ariaLabel={ariaLabel} onSubmit={onSubmit} plain={plain} autoFocus />
              {!plain && variables.length > 0 && (
                <div style={{ fontSize: 12, color: text.secondary }}>
                  Available: {variables.map((name) => `{${name}}`).join("  ")}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function EditorSurface({
  value,
  onChange,
  variables,
  rows,
  placeholder,
  id,
  ariaLabel,
  onSubmit,
  onExpand,
  autoFocus = false,
  plain = false,
}: {
  value: string;
  onChange: (value: string) => void;
  variables: readonly string[];
  rows: number;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  onSubmit?: () => void;
  onExpand?: () => void;
  autoFocus?: boolean;
  plain?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const open = focused ? openPlaceholderAt(value, caret) : null;
  const suggestions = !plain && open && dismissedAt !== open.start ? suggestPlaceholders(variables, open.partial) : [];
  const showSuggestions = suggestions.length > 0;

  useLayoutEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const syncScroll = () => {
    if (backdropRef.current && textareaRef.current) backdropRef.current.scrollTop = textareaRef.current.scrollTop;
  };

  const accept = (name: string) => {
    const next = insertPlaceholder(value, caret, name);
    onChange(next.value);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && onSubmit) {
      event.preventDefault();
      onSubmit();
      return;
    }
    if (!showSuggestions) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      accept(suggestions[Math.min(activeIndex, suggestions.length - 1)]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDismissedAt(open?.start ?? null);
    }
  };

  const segments = plain ? [{ text: value, kind: "text" as const }] : templateSegments(value, variables);
  const minHeight = rows * 20 + 16;
  const font: CSSProperties = plain ? { ...FONT, fontFamily: "inherit", fontSize: 13 } : FONT;

  return (
    <div style={{ position: "relative" }}>
      <div
        className={focused ? "agb-template agb-template-focused" : "agb-template"}
        style={{ position: "relative", minHeight, borderRadius: radius.lg, border: `1px solid ${focused ? border.focus : border.default}`, background: surface.inset, boxShadow: focused ? "0 0 0 3px rgba(143, 186, 255, 0.2)" : "none" }}
      >
        <div ref={backdropRef} aria-hidden="true" style={{ ...font, position: "absolute", inset: 0, overflow: "hidden", color: text.primary, pointerEvents: "none", paddingRight: onExpand ? 34 : 10 }}>
          {segments.map((segment, index) =>
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
          {/* Keeps a trailing newline's height in the mirror. */}
          {"​"}
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          rows={rows}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-autocomplete={plain ? undefined : "list"}
          aria-controls={showSuggestions ? listboxId : undefined}
          aria-activedescendant={showSuggestions ? `${listboxId}-${activeIndex}` : undefined}
          spellCheck={false}
          className="agb-template-input"
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart ?? 0);
            setActiveIndex(0);
            setDismissedAt(null);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
          onScroll={syncScroll}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          style={{
            ...font,
            position: "relative",
            display: "block",
            width: "100%",
            minHeight,
            boxSizing: "border-box",
            margin: 0,
            border: "none",
            outline: "none",
            resize: "vertical",
            background: "transparent",
            color: "transparent",
            caretColor: text.primary,
            paddingRight: onExpand ? 34 : 10,
          }}
        />
        {onExpand && (
          <div style={{ position: "absolute", top: 4, right: 4 }}>
            <IconButton label="Expand editor" icon={<Maximize2 size={13} />} onClick={onExpand} style={{ minWidth: 26, height: 26 }} />
          </div>
        )}
      </div>
      {showSuggestions && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Variables"
          style={{ position: "absolute", zIndex: shell.zIndex.tooltip, left: 8, top: "100%", marginTop: 4, minWidth: 180, listStyle: "none", padding: 4, borderRadius: radius.lg, border: `1px solid ${border.default}`, background: surface.panel, boxShadow: shadow[4] }}
        >
          {suggestions.map((name, index) => (
            <li
              key={name}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                accept(name);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              style={{ padding: "5px 8px", borderRadius: radius.md, fontFamily: FONT.fontFamily, fontSize: 12.5, cursor: "pointer", color: color.primary[500], background: index === activeIndex ? "rgba(143, 186, 255, 0.14)" : "transparent" }}
            >
              {`{${name}}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
