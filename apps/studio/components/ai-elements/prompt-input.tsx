"use client";

import { type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/graph/ui/Button";
import { TextArea } from "@/components/graph/ui/fields";
import { spacing, surface } from "@/lib/graph-theme";

/**
 * Minimal composer (studio-consolidation Phase 8 part E) — a scaled-down
 * version of MUI's `prompt-input.tsx` (1,395 lines: attachments, speech
 * input, a model/tool dropdown, slash-command palette). None of that
 * applies here per the Phase 8 plan: "the model/tool dropdown portion isn't
 * needed since the model is fixed per session." Just a textarea + send
 * button, Enter to submit, Shift+Enter for a newline.
 *
 * Token-styled (apps/studio/AGENTS.md): the chat panel lives on the
 * token-styled graph canvas, so it uses graph-theme tokens, not Tailwind.
 */
const formStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: spacing[2],
  padding: spacing[3],
  borderTop: `1px solid ${surface.border}`,
};

export function PromptInput({
  onSubmit,
  disabled = false,
  placeholder = "Message the model…",
  style,
  actions,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: CSSProperties;
  /** Extra composer controls left of the textarea (e.g. Chat's "Run a graph"). */
  actions?: ReactNode;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ ...formStyle, ...style }}>
      {actions}
      <TextArea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, minHeight: 36, maxHeight: 128, resize: "none" }}
      />
      <Button type="submit" variant="primary" disabled={disabled || value.trim().length === 0}>
        Send
      </Button>
    </form>
  );
}
