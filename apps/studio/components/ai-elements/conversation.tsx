"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal chat scroll container (studio-consolidation Phase 8 part E) —
 * MUI's `conversation.tsx` wraps `use-stick-to-bottom`, a dependency this
 * repo doesn't have; the scratchpad's needs (stick to bottom on new
 * messages, no scroll-position restoration) don't warrant adding it, so
 * this is a plain scrollable div with a ref-based auto-scroll instead.
 */
export function Conversation({
  className,
  children,
  autoScrollKey,
}: {
  className?: string;
  children: ReactNode;
  /** Changes whenever new content is appended, triggering a scroll-to-bottom. */
  autoScrollKey: unknown;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [autoScrollKey]);

  return (
    <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto", className)} role="log">
      {children}
    </div>
  );
}

export function ConversationContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-3 p-3", className)}>{children}</div>;
}

export function ConversationEmptyState({
  title = "No messages yet",
  description = "Send a message to get started",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1 p-8 text-center">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
  );
}
