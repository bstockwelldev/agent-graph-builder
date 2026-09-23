"use client";

import { type FormEvent, type KeyboardEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Minimal composer (studio-consolidation Phase 8 part E) — a scaled-down
 * version of MUI's `prompt-input.tsx` (1,395 lines: attachments, speech
 * input, a model/tool dropdown, slash-command palette). None of that
 * applies here per the Phase 8 plan: "the model/tool dropdown portion isn't
 * needed since the model is fixed per session." Just a textarea + send
 * button, Enter to submit, Shift+Enter for a newline.
 */
export function PromptInput({
  onSubmit,
  disabled = false,
  placeholder = "Message the model…",
  className,
  actions,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
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
    <form onSubmit={handleSubmit} className={cn("flex items-end gap-2 p-3", className)}>
      {actions}
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="max-h-32 min-h-9 flex-1 resize-none"
      />
      <Button type="submit" size="sm" disabled={disabled || value.trim().length === 0}>
        Send
      </Button>
    </form>
  );
}
