"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { spacing, text, typeScale } from "@/lib/graph-theme";

/**
 * Minimal chat scroll container (studio-consolidation Phase 8 part E) —
 * MUI's `conversation.tsx` wraps `use-stick-to-bottom`, a dependency this
 * repo doesn't have; the scratchpad's needs (stick to bottom on new
 * messages, no scroll-position restoration) don't warrant adding it, so
 * this is a plain scrollable div with a ref-based auto-scroll instead.
 *
 * Token-styled (apps/studio/AGENTS.md): the chat panel lives on the
 * token-styled graph canvas, so it uses graph-theme tokens, not Tailwind.
 */
const scrollStyle: CSSProperties = {
  minHeight: 0,
  flex: 1,
  overflowY: "auto",
};

const contentStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: spacing[3],
  padding: spacing[3],
};

const emptyStyle: CSSProperties = {
  display: "flex",
  width: "100%",
  height: "100%",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing[1],
  padding: spacing[8],
  textAlign: "center",
};

export function Conversation({
  children,
  autoScrollKey,
  style,
}: {
  children: ReactNode;
  /** Changes whenever new content is appended, triggering a scroll-to-bottom. */
  autoScrollKey: unknown;
  style?: CSSProperties;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [autoScrollKey]);

  return (
    <div ref={scrollRef} role="log" style={{ ...scrollStyle, ...style }}>
      {children}
    </div>
  );
}

export function ConversationContent({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...contentStyle, ...style }}>{children}</div>;
}

export function ConversationEmptyState({
  title = "No messages yet",
  description = "Send a message to get started",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div style={emptyStyle}>
      <h3 style={{ ...typeScale.small, color: text.primary, margin: 0 }}>{title}</h3>
      <p style={{ ...typeScale.caption, color: text.secondary, margin: 0 }}>{description}</p>
    </div>
  );
}
