"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

import { border, fontFamily, radius, shadow, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { searchNodes, type SearchableNode } from "@bstockwelldev/agent-graph-sdk/graph";
import { IconButton } from "./ui/IconButton";

/**
 * Find on canvas (large-graph complexity, Wave 7a / STO-610): matches node
 * ids, labels, config text and `type:<nodeType>`. Enter / Shift+Enter walk
 * the matches (each selects + pans to the node); non-matches dim via
 * `onMatchesChange`; Esc closes.
 */
export function FindBar({
  nodes,
  onFocusNode,
  onMatchesChange,
  onClose,
  style,
}: {
  nodes: readonly SearchableNode[];
  onFocusNode: (nodeId: string) => void;
  /** Matching ids while a query is typed, null when the query is empty. */
  onMatchesChange: (ids: string[] | null) => void;
  onClose: () => void;
  style?: CSSProperties;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  // The first Enter jumps to the current match; later ones walk the list.
  const [jumped, setJumped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => searchNodes(nodes, query), [nodes, query]);
  const matchKey = matches.join("|");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    onMatchesChange(query.trim() ? matches : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchKey stands in for matches
  }, [matchKey, query]);

  useEffect(() => () => onMatchesChange(null), [onMatchesChange]);

  const go = (step: number) => {
    if (matches.length === 0) return;
    const next = jumped ? (index + step + matches.length) % matches.length : index;
    setIndex(next);
    setJumped(true);
    onFocusNode(matches[next]);
  };

  const status = !query.trim() ? "Type to find" : matches.length === 0 ? "No matches" : `${Math.min(index, matches.length - 1) + 1} of ${matches.length}`;

  return (
    <div role="search" aria-label="Find on canvas" className="glass-panel" style={{ ...barStyle, ...style }}>
      <Search size={14} aria-hidden="true" style={{ color: text.secondary, flexShrink: 0 }} />
      <input
        ref={inputRef}
        aria-label="Find nodes"
        placeholder="Find nodes — id, label, text, type:llm"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
          setJumped(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            go(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        style={inputStyle}
      />
      <span role="status" aria-live="polite" style={{ ...typeScale.caption, color: text.secondary, whiteSpace: "nowrap" }}>
        {status}
      </span>
      <IconButton label="Previous match" icon={<ChevronUp size={14} />} onClick={() => go(-1)} disabled={matches.length === 0} />
      <IconButton label="Next match" icon={<ChevronDown size={14} />} onClick={() => go(1)} disabled={matches.length === 0} />
      <IconButton label="Close find" icon={<X size={14} />} onClick={onClose} />
    </div>
  );
}

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[1],
  padding: `${spacing[1]}px ${spacing[2]}px`,
  borderRadius: radius.xl,
  border: `1px solid ${border.default}`,
  background: surface.panel,
  boxShadow: shadow[4],
  width: "min(440px, calc(100vw - 32px))",
};

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 32,
  border: "none",
  outline: "none",
  background: "transparent",
  color: text.primary,
  fontFamily: fontFamily.ui,
  fontSize: 13,
};
