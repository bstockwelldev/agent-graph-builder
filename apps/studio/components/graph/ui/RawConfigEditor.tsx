import { useState } from "react";
import { Braces, ListTree } from "lucide-react";
import { accentSurface, fontFamily, spacing, text as textColor, typeScale } from "@/lib/graph-theme";
import {
  formatConfigJson,
  fromCanonicalJson,
  parseConfigJson,
  readRawSyntax,
  toCanonicalJson,
  writeRawSyntax,
  type RawSyntax,
} from "@/lib/jsonEditor";
import { Button } from "./Button";
import { IconTabs } from "./IconTabs";
import { TextArea } from "./fields";

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const SYNTAX_TABS = [
  { id: "json", label: "JSON", icon: <Braces size={13} /> },
  { id: "yaml", label: "YAML", icon: <ListTree size={13} /> },
];

/**
 * Raw config editor (studio-config-editor-and-console-plan.md §6) with
 * JSON and YAML views. `parse`/`format` always speak canonical JSON text;
 * the YAML view converts at the edges (`lib/jsonEditor.ts`), so the API and
 * storage only ever see JSON. The chosen view is remembered per browser.
 *
 * Draft text lives in local state until "Apply". When the value changes
 * underneath (a canvas edit, undo) and there are no unapplied edits, the
 * draft follows it; with unapplied edits it is kept and flagged instead.
 */
export function RawConfigEditor<T>({
  value,
  onApply,
  disabled = false,
  parse = parseConfigJson as unknown as (json: string) => ParseResult<T>,
  format = formatConfigJson as unknown as (value: T) => string,
  height = 220,
  label = "Raw config",
}: {
  value: T;
  onApply: (next: T) => void;
  disabled?: boolean;
  /** Canonical JSON text -> value. Defaults to "any JSON object"; pass a
   * narrower one when the editable surface is smaller (e.g. `parseEdgeRawConfig`). */
  parse?: (json: string) => ParseResult<T>;
  /** Value -> canonical JSON text. */
  format?: (value: T) => string;
  height?: number;
  /** Accessible name for the text area. */
  label?: string;
}) {
  const [syntax, setSyntax] = useState<RawSyntax>(readRawSyntax);
  const canonical = format(value);
  const [base, setBase] = useState(canonical);
  const [text, setText] = useState(() => fromCanonicalJson(canonical, syntax));
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const hasEdits = text !== fromCanonicalJson(base, syntax);
  if (canonical !== base) {
    // Render-time sync (React's "adjust state on prop change" pattern).
    setBase(canonical);
    if (hasEdits) setStale(true);
    else setText(fromCanonicalJson(canonical, syntax));
  }

  function switchSyntax(next: RawSyntax) {
    if (next === syntax) return;
    const converted = toCanonicalJson(text, syntax);
    if (!converted.ok) {
      setError(`${converted.error} — fix it before switching to ${next.toUpperCase()}.`);
      return;
    }
    let json: string;
    try {
      json = JSON.stringify(JSON.parse(converted.json), null, 2);
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)} — fix it before switching to ${next.toUpperCase()}.`);
      return;
    }
    setError(null);
    setSyntax(next);
    writeRawSyntax(next);
    // Unedited drafts re-derive from the value so key order and formatting stay canonical.
    setText(hasEdits ? fromCanonicalJson(json, next) : fromCanonicalJson(base, next));
  }

  function handleApply() {
    const converted = toCanonicalJson(text, syntax);
    const result = converted.ok ? parse(converted.json) : converted;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const applied = format(result.value);
    setError(null);
    setStale(false);
    setBase(applied);
    setText(fromCanonicalJson(applied, syntax));
    onApply(result.value);
  }

  function handleReset() {
    setText(fromCanonicalJson(canonical, syntax));
    setBase(canonical);
    setStale(false);
    setError(null);
  }

  return (
    <div>
      <div style={{ marginBottom: spacing[2] }}>
        <IconTabs tabs={SYNTAX_TABS} activeId={syntax} onChange={(id) => switchSyntax(id as RawSyntax)} aria-label="Config format" />
      </div>
      <TextArea
        aria-label={`${label} (${syntax.toUpperCase()})`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        disabled={disabled}
        spellCheck={false}
        style={{ height, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: "18px" }}
      />
      {stale && !error && (
        <div role="status" style={{ ...typeScale.caption, color: textColor.secondary, marginTop: spacing[1] }}>
          Changed elsewhere since you started editing. Apply keeps your version; Reset loads the latest.
        </div>
      )}
      {error && (
        <div role="alert" style={{ ...typeScale.caption, color: accentSurface.destructive.text, marginTop: spacing[1] }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[2] }}>
        <Button variant="primary" disabled={disabled || !hasEdits} onClick={handleApply}>
          Apply
        </Button>
        <Button variant="secondary" disabled={disabled || !hasEdits} onClick={handleReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
