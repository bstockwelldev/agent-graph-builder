"use client";

import { EDGE_PATTERNS, EDGE_ROUTINGS, type EdgeStyle } from "@/lib/edgeStyle";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import type { EdgeKind, NodeType } from "@bstockwelldev/agent-graph-sdk";
import { EDGE_KIND_TAXONOMY, NODE_TYPE_TAXONOMY } from "@/content/taxonomy";
import {
  color,
  nodeType,
  radius,
  shell,
  spacing,
  surface,
  text,
  typeScale,
} from "@/lib/graph-theme";
import { NODE_TYPE_ICONS } from "./nodeTypeIcons";
import {
  PALETTE_DRAG_TYPE,
  PALETTE_SECTIONS,
  filterPaletteItems,
  nodeTypeItems,
  type PaletteDrop,
  type PaletteItem,
} from "./paletteSections";
import { TaxonomyTooltip } from "./Tooltip";
import { IconButton } from "./ui/IconButton";
import { SectionHeader } from "./ui/SectionHeader";

// All 14 types (subgraph and transform included; studio-consolidation Phase 4d) — AGB's
// former playground only ever authored the original 6; the rest were fully
// executable server-side but had no UI path to create them until then.
export const NODE_TYPES: NodeType[] = [
  "input",
  "prompt",
  "llm",
  "tool",
  "router",
  "output",
  "guardrail",
  "rubric",
  "branch",
  "tool_loop",
  "code_exec",
  "human_gate",
  "subgraph",
  "transform",
];

const EDGE_KINDS: EdgeKind[] = ["sequence", "conditional", "default"];

function startDrag(event: DragEvent<HTMLElement>, item: PaletteDrop) {
  event.dataTransfer.setData(
    PALETTE_DRAG_TYPE,
    JSON.stringify({ nodeType: item.nodeType, config: item.config }),
  );
  event.dataTransfer.effectAllowed = "copy";
}

/**
 * The node palette (canvas-workbench-ergonomics-plan.md §4): searchable
 * sections from `paletteSections.ts` — node types, library prompts, LLM
 * profiles and tools (added as bound nodes), transforms and saved graphs as
 * subgraphs — plus the kind new connections get. Click or Enter adds at the
 * viewport center; drag drops at the pointer. Folds to an icon strip.
 */
export function NodePalette({
  onAdd,
  graphId = null,
  collapsed = false,
  onCollapsedChange,
  defaultEdgeKind,
  onDefaultEdgeKindChange,
  defaultEdgeStyle,
  onDefaultEdgeStyleChange,
}: {
  onAdd: (type: NodeType, config?: Record<string, unknown>) => void;
  graphId?: string | null;
  collapsed?: boolean;
  /** Omit to hide the fold control (the compact drawer). */
  onCollapsedChange?: (collapsed: boolean) => void;
  defaultEdgeKind?: EdgeKind;
  onDefaultEdgeKindChange?: (kind: EdgeKind) => void;
  /** The line new edges get (routing and pattern); display only. */
  defaultEdgeStyle?: EdgeStyle;
  onDefaultEdgeStyleChange?: (style: EdgeStyle) => void;
}) {
  if (collapsed)
    return (
      <PaletteStrip onAdd={onAdd} onExpand={() => onCollapsedChange?.(false)} />
    );
  return (
    <FullPalette
      onAdd={onAdd}
      graphId={graphId}
      onCollapse={onCollapsedChange ? () => onCollapsedChange(true) : undefined}
      defaultEdgeKind={defaultEdgeKind}
      onDefaultEdgeKindChange={onDefaultEdgeKindChange}
      defaultEdgeStyle={defaultEdgeStyle}
      onDefaultEdgeStyleChange={onDefaultEdgeStyleChange}
    />
  );
}

function FullPalette({
  onAdd,
  graphId,
  onCollapse,
  defaultEdgeKind,
  onDefaultEdgeKindChange,
  defaultEdgeStyle,
  onDefaultEdgeStyleChange,
}: {
  onAdd: (type: NodeType, config?: Record<string, unknown>) => void;
  graphId: string | null;
  onCollapse?: () => void;
  defaultEdgeKind?: EdgeKind;
  onDefaultEdgeKindChange?: (kind: EdgeKind) => void;
  defaultEdgeStyle?: EdgeStyle;
  onDefaultEdgeStyleChange?: (style: EdgeStyle) => void;
}) {
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<Record<string, PaletteItem[] | null>>(
    () =>
      Object.fromEntries(
        PALETTE_SECTIONS.map((section) => [
          section.id,
          section.id === "nodes" ? nodeTypeItems() : null,
        ]),
      ),
  );

  useEffect(() => {
    let cancelled = false;
    for (const section of PALETTE_SECTIONS) {
      if (section.id === "nodes") continue;
      Promise.resolve(section.load({ graphId }))
        .catch(() => [])
        .then((items) => {
          if (!cancelled)
            setLoaded((current) => ({ ...current, [section.id]: items }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [graphId]);

  const sections = useMemo(
    () =>
      PALETTE_SECTIONS.map((section) => {
        const items = loaded[section.id];
        return {
          section,
          items: items === null ? null : filterPaletteItems(items, query),
        };
      }),
    [loaded, query],
  );

  return (
    <div style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing[1],
          marginBottom: spacing[2],
        }}
      >
        <div style={{ flex: 1 }}>
          <SectionHeader>Node Palette</SectionHeader>
        </div>
        {onCollapse && (
          <IconButton
            label="Collapse palette"
            icon={<ChevronsLeft size={16} />}
            onClick={onCollapse}
          />
        )}
      </div>
      <label style={searchStyle}>
        <Search
          size={14}
          aria-hidden="true"
          style={{ color: text.secondary, flexShrink: 0 }}
        />
        <input
          type="search"
          aria-label="Search the palette"
          placeholder="Search nodes, library, graphs…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="agb-focus-ring"
          style={searchInputStyle}
        />
      </label>

      {onDefaultEdgeKindChange && defaultEdgeKind && (
        <div
          role="group"
          aria-label="New edges"
          style={{ marginBottom: spacing[3] }}
        >
          <div style={captionStyle}>New edges</div>
          <div style={{ display: "flex", gap: 4 }}>
            {EDGE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className="agb-focus-ring agb-hoverable"
                aria-pressed={defaultEdgeKind === kind}
                title={EDGE_KIND_TAXONOMY[kind].summary}
                onClick={() => onDefaultEdgeKindChange(kind)}
                style={segmentStyle(defaultEdgeKind === kind)}
              >
                {EDGE_KIND_TAXONOMY[kind].title}
              </button>
            ))}
          </div>
          {onDefaultEdgeStyleChange && defaultEdgeStyle && (
            <>
              <div role="group" aria-label="New edge routing" style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {EDGE_ROUTINGS.map((option) => {
                  const active = (defaultEdgeStyle.routing ?? "curved") === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="agb-focus-ring agb-hoverable"
                      aria-pressed={active}
                      onClick={() => onDefaultEdgeStyleChange({ ...defaultEdgeStyle, routing: option.value === "curved" ? undefined : option.value })}
                      style={segmentStyle(active)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div role="group" aria-label="New edge pattern" style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {[{ value: undefined, label: "By kind" }, ...EDGE_PATTERNS].map((option) => {
                  const active = defaultEdgeStyle.pattern === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      className="agb-focus-ring agb-hoverable"
                      aria-pressed={active}
                      title={option.value ? undefined : "Always solid, Match text dashed, Fallback dotted"}
                      onClick={() => onDefaultEdgeStyleChange({ ...defaultEdgeStyle, pattern: option.value })}
                      style={segmentStyle(active)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {sections.map(({ section, items }) => (
        <section
          key={section.id}
          aria-label={section.title}
          style={{ marginBottom: spacing[3] }}
        >
          <div
            style={{ ...captionStyle, fontWeight: 600, color: text.primary }}
          >
            {section.title}
          </div>
          {items === null ? (
            <div style={emptyStyle}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={emptyStyle}>
              {query ? "No matches." : section.emptyLabel}
            </div>
          ) : (
            items.map((item) => (
              <PaletteEntry key={item.key} item={item} onAdd={onAdd} />
            ))
          )}
        </section>
      ))}
    </div>
  );
}

function PaletteEntry({
  item,
  onAdd,
}: {
  item: PaletteItem;
  onAdd: (type: NodeType, config?: Record<string, unknown>) => void;
}) {
  const tokens = nodeType[item.nodeType];
  const taxonomy = NODE_TYPE_TAXONOMY[item.nodeType];
  const bound = item.config !== undefined;
  const button = (
    <button
      type="button"
      draggable
      onDragStart={(event) => startDrag(event, item)}
      onClick={() => onAdd(item.nodeType, item.config)}
      className="agb-focus-ring agb-hoverable"
      style={{ ...itemStyle, borderLeft: `3px solid ${tokens.accent}` }}
    >
      <div style={{ fontWeight: 600, color: tokens.label }}>{item.label}</div>
      <div
        style={{
          ...typeScale.caption,
          color: text.secondary,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {bound ? `${taxonomy.title} · ${item.detail}` : item.detail}
      </div>
    </button>
  );
  return (
    <>
      {item.group && <div style={captionStyle}>{item.group}</div>}
      <div style={{ marginBottom: spacing[1] }}>
        {bound ? (
          button
        ) : (
          <TaxonomyTooltip
            layout="corner"
            title={taxonomy.title}
            summary={taxonomy.summary}
            details={taxonomy.details}
          >
            {button}
          </TaxonomyTooltip>
        )}
      </div>
    </>
  );
}

/** The palette folded to icons: node types only, still clickable and draggable. */
function PaletteStrip({
  onAdd,
  onExpand,
}: {
  onAdd: (type: NodeType) => void;
  onExpand: () => void;
}) {
  return (
    <div role="group" aria-label="Node palette (collapsed)" style={stripStyle}>
      <IconButton
        label="Expand palette"
        icon={<ChevronsRight size={16} />}
        onClick={onExpand}
        tooltipPlacement="bottom"
      />
      <div
        style={{
          height: 1,
          alignSelf: "stretch",
          background: surface.border,
          margin: `${spacing[1]}px 0`,
        }}
      />
      {nodeTypeItems().map((item) => {
        const Icon = NODE_TYPE_ICONS[item.nodeType];
        return (
          <span
            key={item.key}
            draggable
            onDragStart={(event) => startDrag(event, item)}
            style={{ display: "inline-flex" }}
          >
            <IconButton
              label={`Add ${NODE_TYPE_TAXONOMY[item.nodeType].title}`}
              icon={<Icon size={16} color={nodeType[item.nodeType].accent} />}
              onClick={() => onAdd(item.nodeType)}
            />
          </span>
        );
      })}
    </div>
  );
}

const panelStyle: CSSProperties = {
  width: "100%",
  padding: shell.panelPadding,
  background: surface.panel,
  color: text.primary,
};

const stripStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  padding: `${spacing[2]}px 0`,
  background: surface.panel,
  minHeight: "100%",
};

const itemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  minHeight: 44,
  padding: `${spacing[1]}px ${spacing[2]}px`,
  borderRadius: radius.lg,
  border: `1px solid ${surface.border}`,
  background: surface.raised,
  color: text.primary,
  cursor: "grab",
  ...typeScale.small,
};

const captionStyle: CSSProperties = {
  ...typeScale.caption,
  color: text.secondary,
  margin: `${spacing[1]}px 0 ${spacing[1]}px`,
};

const emptyStyle: CSSProperties = {
  ...typeScale.caption,
  color: text.secondary,
  padding: `${spacing[1]}px 0`,
};

const searchStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: spacing[1],
  marginBottom: spacing[3],
  padding: `0 ${spacing[2]}px`,
  borderRadius: radius.md,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.raised,
};

const searchInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 32,
  border: "none",
  background: "transparent",
  color: text.primary,
  ...typeScale.caption,
};

function segmentStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    height: 28,
    borderRadius: radius.md,
    border: `1px solid ${active ? color.primary[500] : surface.border}`,
    background: active ? surface.raised : "transparent",
    color: active ? color.primary[500] : text.secondary,
    cursor: "pointer",
    ...typeScale.caption,
  };
}
