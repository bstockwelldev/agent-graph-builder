import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal chat bubble (studio-consolidation Phase 8 part E) — a scaled-down
 * version of MUI's `message.tsx`. Skips branching/attachments/actions and
 * the Streamdown markdown renderer (this scratchpad has no rich-content
 * use case yet); plain text is enough for a direct model chat.
 */
export function Message({ from, children }: { from: "user" | "assistant"; children: ReactNode }) {
  return (
    <div className={cn("flex w-full max-w-[90%] flex-col gap-1", from === "user" ? "ml-auto items-end" : "items-start")}>
      {children}
    </div>
  );
}

export function MessageContent({ from, children }: { from: "user" | "assistant"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "w-fit max-w-full min-w-0 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
        from === "user" ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground",
      )}
    >
      {children}
    </div>
  );
}
