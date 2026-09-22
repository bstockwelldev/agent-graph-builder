import { useState } from "react";
import { accentSurface, fontFamily, spacing, typeScale } from "@/lib/graph-theme";
import { formatConfigJson, parseConfigJson } from "@/lib/jsonEditor";
import { Button } from "./Button";
import { TextArea } from "./fields";

/**
 * Raw JSON config editor (studio-config-editor-and-console-plan.md §6,
 * Phase 1). A lightweight plain-text editor, not a syntax-highlighted one
 * — the spec allows starting here and only reaching for a heavier
 * dependency (Monaco/CodeMirror) if plain-text editing proves
 * insufficient in practice; nothing about node/edge config editing so far
 * has needed more than JSON.parse-level validation and pretty-printing.
 *
 * Draft text lives in local state, uncommitted until "Apply" — remounting
 * (e.g. switching tabs away and back, which NodeInspector does on every
 * selection change) re-derives it from `value`, so only in-progress,
 * never-applied keystrokes are ever lost, not committed config data.
 */
export function JsonEditor<T>({
  value,
  onApply,
  disabled = false,
  parse = parseConfigJson as unknown as (text: string) => { ok: true; value: T } | { ok: false; error: string },
  format = formatConfigJson as unknown as (value: T) => string,
}: {
  value: T;
  onApply: (next: T) => void;
  disabled?: boolean;
  /** Defaults to generic "valid JSON object" validation. Pass a narrower
   * one (e.g. edge kind/condition) when the editable surface is smaller
   * than an arbitrary object — see `lib/jsonEditor.ts`'s `parseEdgeRawConfig`. */
  parse?: (text: string) => { ok: true; value: T } | { ok: false; error: string };
  format?: (value: T) => string;
}) {
  const [text, setText] = useState(() => format(value));
  const [error, setError] = useState<string | null>(null);
  const dirty = text !== format(value);

  function handleApply() {
    const result = parse(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setText(format(result.value));
    onApply(result.value);
  }

  function handleReset() {
    setText(format(value));
    setError(null);
  }

  return (
    <div>
      <TextArea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        disabled={disabled}
        spellCheck={false}
        style={{ height: 220, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: "18px" }}
      />
      {error && (
        <div role="alert" style={{ ...typeScale.caption, color: accentSurface.destructive.text, marginTop: spacing[1] }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: spacing[2], marginTop: spacing[2] }}>
        <Button variant="primary" disabled={disabled || !dirty} onClick={handleApply}>
          Apply
        </Button>
        <Button variant="secondary" disabled={disabled || !dirty} onClick={handleReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
