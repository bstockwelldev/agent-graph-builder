"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowDownToLine, Download, Eraser, X } from "lucide-react";
import {
  clearConsole,
  consoleSources,
  filterConsoleEntries,
  severityCounts,
  toNdjson,
  useConsoleLog,
  type ConsoleEntry,
  type ConsoleSeverity,
} from "@/lib/consoleLog";
import {
  color,
  fontFamily,
  radius,
  spacing,
  surface,
  text,
  typeScale,
} from "@/lib/graph-theme";
import { IconButton } from "./ui/IconButton";

const HEIGHT_STORAGE_KEY = "agb.console.height";
const DEFAULT_HEIGHT = 220;
const MIN_HEIGHT = 120;
/** Within this many px of the bottom counts as following the tail. */
const FOLLOW_SLACK_PX = 24;

const SEVERITIES: { id: ConsoleSeverity; label: string }[] = [
  { id: "info", label: "Info" },
  { id: "warning", label: "Warnings" },
  { id: "error", label: "Errors" },
];

const LEVEL_COLOR: Record<ConsoleSeverity, string> = {
  info: text.secondary,
  warning: color.warning[500],
  error: color.error[500],
};

const LEVEL_TAG: Record<ConsoleSeverity, string> = {
  info: "INFO",
  warning: "WARN",
  error: "ERR ",
};

function maxHeight(): number {
  return typeof window === "undefined"
    ? 600
    : Math.round(window.innerHeight * 0.6);
}

function clampHeight(height: number): number {
  return Math.min(maxHeight(), Math.max(MIN_HEIGHT, Math.round(height)));
}

function readStoredHeight(): number {
  try {
    const stored = Number(window.localStorage.getItem(HEIGHT_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0
      ? clampHeight(stored)
      : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(undefined, { hour12: false });
}

/** Summary for the status bar's console segment: "2 errors · 5 warnings". */
export function consoleCountsLabel(
  counts: Record<ConsoleSeverity, number>,
): string {
  const parts = [
    counts.error > 0
      ? `${counts.error} error${counts.error === 1 ? "" : "s"}`
      : null,
    counts.warning > 0
      ? `${counts.warning} warning${counts.warning === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Console";
}

/**
 * The console as a terminal-style dock at the bottom of the canvas
 * (canvas-workbench-ergonomics-plan.md §6). Reads the app-wide log store
 * (`lib/consoleLog.ts`): run events, validation and save results, and the
 * user's own actions. Collapsed to the status bar's console segment until
 * opened; its height is per viewer, kept in localStorage.
 */
export function CanvasConsoleDock({
  graphId,
  onFocusNode,
  onClose,
}: {
  graphId: string | null;
  /** Focus a node on this graph (entries from other graphs navigate instead). */
  onFocusNode: (entry: ConsoleEntry) => void;
  onClose: () => void;
}) {
  const entries = useConsoleLog();
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [severities, setSeverities] = useState<Set<ConsoleSeverity>>(
    () => new Set(["info", "warning", "error"]),
  );
  const [source, setSource] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [following, setFollowing] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const seenErrorsRef = useRef<number | null>(null);

  useEffect(() => setHeight(readStoredHeight()), []);
  const commitHeight = (next: number) => {
    const clamped = clampHeight(next);
    setHeight(clamped);
    try {
      window.localStorage.setItem(HEIGHT_STORAGE_KEY, String(clamped));
    } catch {
      // The height just won't persist.
    }
  };

  const counts = useMemo(() => severityCounts(entries), [entries]);
  const sources = useMemo(() => consoleSources(entries), [entries]);
  const visible = useMemo(
    () => filterConsoleEntries(entries, { severities, source, query }),
    [entries, severities, source, query],
  );

  // Follow the tail: stay pinned to the newest entry unless scrolled up.
  useEffect(() => {
    const list = listRef.current;
    if (list && following) list.scrollTop = list.scrollHeight;
  }, [visible, following, height]);

  // Announce new errors politely; run chatter stays silent.
  useEffect(() => {
    if (
      seenErrorsRef.current !== null &&
      counts.error > seenErrorsRef.current
    ) {
      const latest = [...entries]
        .reverse()
        .find((entry) => entry.severity === "error");
      if (latest) setAnnouncement(`New error: ${latest.message}`);
    }
    seenErrorsRef.current = counts.error;
  }, [counts.error, entries]);

  const toggleSeverity = (id: ConsoleSeverity) =>
    setSeverities((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportNdjson = () => {
    const blob = new Blob([toNdjson(visible)], {
      type: "application/x-ndjson",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `console-${graphId ?? "studio"}-${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) =>
      setHeight(clampHeight(startHeight + (startY - move.clientY)));
    const onUp = (up: PointerEvent) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      commitHeight(startHeight + (startY - up.clientY));
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  const onResizeKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      commitHeight(height + (event.key === "ArrowUp" ? 24 : -24));
    }
  };

  return (
    <section aria-label="Console" style={{ ...dockStyle, height }}>
      <div
        role="separator"
        aria-label="Resize console"
        aria-orientation="horizontal"
        aria-valuenow={height}
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={maxHeight()}
        tabIndex={0}
        className="agb-focus-ring"
        onPointerDown={startResize}
        onKeyDown={onResizeKey}
        style={resizeHandleStyle}
      />
      <div style={toolbarStyle}>
        <strong
          style={{
            ...typeScale.caption,
            color: text.primary,
            marginRight: spacing[1],
          }}
        >
          Console
        </strong>
        <div
          role="group"
          aria-label="Levels"
          style={{ display: "inline-flex", gap: 2 }}
        >
          {SEVERITIES.map((severity) => (
            <button
              key={severity.id}
              type="button"
              className="agb-focus-ring agb-hoverable"
              aria-pressed={severities.has(severity.id)}
              onClick={() => toggleSeverity(severity.id)}
              style={chipStyle(
                severities.has(severity.id),
                LEVEL_COLOR[severity.id],
              )}
            >
              {severity.label} {counts[severity.id]}
            </button>
          ))}
        </div>
        <select
          aria-label="Source"
          value={source ?? ""}
          onChange={(event) => setSource(event.target.value || null)}
          style={inputStyle}
        >
          <option value="">All sources</option>
          {sources.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Filter console"
          placeholder="Filter (message, node, run)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ ...inputStyle, flex: "1 1 120px", minWidth: 80 }}
        />
        {!following && (
          <IconButton
            label="Jump to latest"
            icon={<ArrowDownToLine size={14} />}
            onClick={() => setFollowing(true)}
            tooltipPlacement="top"
          />
        )}
        <IconButton
          label="Export as NDJSON"
          icon={<Download size={14} />}
          onClick={exportNdjson}
          disabled={visible.length === 0}
          tooltipPlacement="top"
        />
        <IconButton
          label="Clear console"
          icon={<Eraser size={14} />}
          onClick={clearConsole}
          disabled={entries.length === 0}
          tooltipPlacement="top"
        />
        <IconButton
          label="Close console"
          shortcut="⌘⇧J"
          icon={<X size={14} />}
          onClick={onClose}
          tooltipPlacement="top"
        />
      </div>
      <div
        ref={listRef}
        role="log"
        aria-label="Console entries"
        aria-live="off"
        tabIndex={0}
        className="agb-focus-ring"
        onScroll={(event) => {
          const list = event.currentTarget;
          setFollowing(
            list.scrollHeight - list.scrollTop - list.clientHeight <=
              FOLLOW_SLACK_PX,
          );
        }}
        style={listStyle}
      >
        {visible.length === 0 ? (
          <div style={{ color: text.secondary, padding: spacing[2] }}>
            {entries.length === 0
              ? "No entries yet. Runs, validation, saves and your edits log here."
              : "No entries match the filters."}
          </div>
        ) : (
          visible.map((entry) => (
            <div key={entry.id} data-severity={entry.severity} style={rowStyle}>
              <span style={{ color: text.secondary }}>
                {formatTime(entry.timestamp)}
              </span>
              <span
                style={{ color: LEVEL_COLOR[entry.severity], fontWeight: 600 }}
              >
                {LEVEL_TAG[entry.severity]}
              </span>
              <span style={{ color: text.secondary }}>{entry.source}</span>
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                {entry.nodeId && entry.graphId && (
                  <>
                    <button
                      type="button"
                      className="agb-focus-ring"
                      title={
                        entry.graphId === graphId
                          ? "Focus this node"
                          : "Open this node's graph"
                      }
                      onClick={() => onFocusNode(entry)}
                      style={nodeLinkStyle}
                    >
                      {entry.nodeId}
                    </button>{" "}
                  </>
                )}
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
      <div role="status" aria-live="polite" style={visuallyHidden}>
        {announcement}
      </div>
    </section>
  );
}

const dockStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  borderTop: `1px solid ${surface.borderStrong}`,
  background: color.neutral[950],
  color: text.primary,
};

const resizeHandleStyle: CSSProperties = {
  position: "absolute",
  top: -3,
  left: 0,
  right: 0,
  height: 6,
  cursor: "row-resize",
  zIndex: 1,
  touchAction: "none",
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: spacing[1],
  padding: `2px ${spacing[2]}px`,
  borderBottom: `1px solid ${surface.border}`,
  background: surface.panel,
};

const inputStyle: CSSProperties = {
  height: 24,
  padding: `0 ${spacing[1]}px`,
  borderRadius: radius.md,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
  color: text.primary,
  ...typeScale.caption,
};

function chipStyle(active: boolean, tone: string): CSSProperties {
  return {
    height: 22,
    padding: `0 ${spacing[1] + 2}px`,
    borderRadius: radius.md,
    border: `1px solid ${active ? tone : surface.border}`,
    background: active ? surface.raised : "transparent",
    color: active ? tone : text.secondary,
    cursor: "pointer",
    ...typeScale.caption,
  };
}

const listStyle: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  padding: `${spacing[1]}px ${spacing[2]}px`,
  fontFamily: fontFamily.mono,
  fontSize: 12,
  lineHeight: "18px",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 4ch minmax(64px, auto) 1fr",
  columnGap: spacing[2],
  alignItems: "baseline",
};

const nodeLinkStyle: CSSProperties = {
  padding: 0,
  border: "none",
  background: "transparent",
  color: color.primary[500],
  textDecoration: "underline",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "inherit",
};

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
