import type { CSSProperties, ReactNode } from "react";
import { color, localType, radius, spacing, surface, text } from "@/lib/graph-theme";

/**
 * Minimal chat bubble (studio-consolidation Phase 8 part E) — a scaled-down
 * version of MUI's `message.tsx`. Skips branching/attachments/actions and
 * the Streamdown markdown renderer (this scratchpad has no rich-content
 * use case yet); plain text is enough for a direct model chat.
 *
 * Token-styled (apps/studio/AGENTS.md): the chat panel lives on the
 * token-styled graph canvas, so it uses graph-theme tokens, not Tailwind.
 */
export function Message({ from, children }: { from: "user" | "assistant"; children: ReactNode }) {
  const style: CSSProperties = {
    display: "flex",
    width: "100%",
    maxWidth: "90%",
    flexDirection: "column",
    gap: spacing[1],
    ...(from === "user" ? { marginLeft: "auto", alignItems: "flex-end" } : { alignItems: "flex-start" }),
  };
  return <div style={style}>{children}</div>;
}

const bubbleBase: CSSProperties = {
  width: "fit-content",
  maxWidth: "100%",
  minWidth: 0,
  borderRadius: radius.lg,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  ...localType.ui,
};

const bubbleStyle: Record<"user" | "assistant", CSSProperties> = {
  user: {
    ...bubbleBase,
    background: color.primary.solid,
    color: text.primary,
  },
  assistant: {
    ...bubbleBase,
    background: surface.raised,
    border: `1px solid ${surface.border}`,
    color: text.primary,
  },
};

export function MessageContent({ from, children }: { from: "user" | "assistant"; children: ReactNode }) {
  return <div style={bubbleStyle[from]}>{children}</div>;
}
