import { Handle, NodeToolbar, Position, useConnection, type NodeProps } from "@xyflow/react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Crosshair,
  Library,
  PauseCircle,
  Play,
  Settings2,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CompileIssue } from "@/lib/diagnostics";
import type { GraphNode, NodeType } from "@bstockwelldev/agent-graph-sdk";
import {
  color,
  fontFamily,
  nodeType as nodeTypeTokens,
  nodeTypeGlow,
  radius,
  shadow,
  shell,
  spacing,
  status as statusColor,
  surface,
  text,
} from "@/lib/graph-theme";
import { acceptsAnyKind, computePortDragCompatibility, inputPortsFor, outputPortsFor } from "@/content/node-ports";
import { NODE_TYPE_TAXONOMY } from "@/content/taxonomy";
import { boundTitleFor, summaryFor } from "@bstockwelldev/agent-graph-sdk/graph";
import { nodeBindings } from "@bstockwelldev/agent-graph-sdk";
import { useResourceNames } from "../resourceBindings";
import { NODE_CARD_MAX_HEIGHT, NODE_CARD_WIDTH } from "@/layout/nodeGeometry";
import { useCanvasActions } from "../canvasActions";
import { NODE_TYPE_ICONS } from "../nodeTypeIcons";
import { HoverTooltip } from "../ui/HoverTooltip";
import { IconButton } from "../ui/IconButton";

const ICONS = NODE_TYPE_ICONS;

export type NodeRunStatus = "idle" | "running" | "succeeded" | "failed" | "paused";

/** Last-run digest for the hover preview (Slice 4). */
export type NodeTraceSummary = {
  status: string;
  durationMs?: number | null;
  error?: string | null;
};

export interface GraphNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  /** Rendered title: the user's name (`userLabel`) or the config-derived label. */
  label: string;
  /** User-given name, persisted as `node.extensions.label`. */
  userLabel?: string;
  /** The node's `extensions` bag, round-tripped as-is by buildGraphDefinition. */
  extensions?: Record<string, unknown>;
  /** Author-declared ports (no editor yet), round-tripped as-is so a save never drops them. */
  ports?: Pick<GraphNode, "input_ports" | "output_ports">;
  config: Record<string, unknown>;
  // "paused" added for the `human_gate` node type (studio-consolidation
  // Phase 2).
  status?: NodeRunStatus;
  /** The displayed run status predates the graph's latest edit. */
  statusStale?: boolean;
  compileIssue?: CompileIssue | null;
  inspectionDimmed?: boolean;
  // Phase 10 Slice D ("Focus mode") -- true when this node is outside the
  // selected node's ancestor/descendant closure while focus mode is on.
  focusDimmed?: boolean;
  /** Outgoing edge count, for router/branch "N routes" summaries. */
  routeCount?: number;
  traceSummary?: NodeTraceSummary | null;
  /** Wave 7d Heatmap view: this node's metric tint and value badge.
   * `null` (in heatmap view) means no data -- rendered neutral. */
  heat?: { label: string; color: string } | null;
}

const STATUS_ICON: Partial<Record<NodeRunStatus, LucideIcon>> = {
  succeeded: CheckCircle2,
  failed: XCircle,
  paused: PauseCircle,
};

const HOVER_PREVIEW_DELAY_MS = 350;

function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

function portSummary(ports: { name: string; contract: { kind: string } }[]): string | null {
  if (ports.length === 0) return null;
  if (ports.length === 1) return ports[0].contract.kind;
  return ports.map((port) => port.name).join(", ");
}

function shapeStyles(type: NodeType): CSSProperties {
  switch (type) {
    case "output":
      return { borderRadius: radius.xxl * 2 };
    case "tool":
      return { borderRadius: radius.sm };
    case "prompt":
      return { borderRadius: radius.xl };
    case "input":
      return { borderRadius: radius.lg, borderTopLeftRadius: radius.xxl * 2, borderBottomLeftRadius: radius.xxl * 2 };
    case "router":
      // Drawn by the SVG hexagon below instead of the box border: the old
      // `clipPath` diamond clipped away the card's own border and shadow,
      // so selection, run status, and issue borders were near-invisible on
      // routers (studio-graph-workbench-redesign-plan.md, Slice 4).
      return { border: "none", background: "transparent", boxShadow: "none", paddingLeft: 22, paddingRight: 22 };
    default:
      return { borderRadius: radius.lg };
  }
}

/**
 * Node card (studio-graph-workbench-redesign-plan.md, Slice 4; review
 * sections 13-17). Communicates at rest: type, identity, purpose, key
 * config, run state, issues, and I/O. Hover previews the last run;
 * selection shows a contextual NodeToolbar. Geometry is fixed by
 * layout/nodeGeometry.ts so auto-layout never overlaps real cards.
 *
 * State layers are independent rather than one border color winning:
 * selection = outer outline, run status = border + header pill,
 * diagnostics = header badge (+ border while idle).
 */
export function GraphNodeView({ id, data, selected, sourcePosition = Position.Right, targetPosition = Position.Left }: NodeProps) {
  const nodeData = data as GraphNodeData;
  const actions = useCanvasActions();
  const nodeStatus = nodeData.status ?? "idle";
  const compileIssue = nodeData.compileIssue ?? null;
  const dimmed = (nodeData.inspectionDimmed ?? false) || (nodeData.focusDimmed ?? false);
  const type = nodeData.nodeType;
  const isRouter = type === "router";
  const showTargetHandle = type !== "input";
  const showSourceHandle = type !== "output";
  const Icon = ICONS[type];
  const tokens = nodeTypeTokens[type];
  const resourceNames = useResourceNames();
  const summary = summaryFor(type, nodeData.config, {
    hasUserLabel: Boolean(nodeData.userLabel),
    routeCount: nodeData.routeCount,
    resourceNames,
  });
  // Wave 4a: a node bound to a library resource is titled by that
  // resource's name (unless the user named the node) and carries a glyph.
  const bindings = nodeBindings(type, nodeData.config).filter((binding) => binding.kind !== "tools");
  const boundTitle = nodeData.userLabel ? null : boundTitleFor(type, nodeData.config, resourceNames);
  const declaredInputs = { type, input_ports: nodeData.ports?.input_ports };
  const inputs = acceptsAnyKind(declaredInputs) ? "any" : portSummary(inputPortsFor(declaredInputs));
  const outputs = portSummary(outputPortsFor({ type, config: nodeData.config }));

  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    },
    [],
  );
  const onPointerEnter = () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setHovered(true), HOVER_PREVIEW_DELAY_MS);
  };
  const onPointerLeave = () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setHovered(false);
  };

  const handleHit = shell.touchTarget.min;
  const handleStyle: CSSProperties = {
    width: handleHit,
    height: handleHit,
    minWidth: handleHit,
    minHeight: handleHit,
    background: `radial-gradient(circle, ${tokens.accent} 0 6px, transparent 7px)`,
    border: "none",
    borderRadius: 999,
  };

  // Phase 10 Slice C follow-up (typed-port connect-drag feedback) --
  // unchanged: highlight this node's target handle as compatible /
  // needs-transform / incompatible with the port being dragged.
  const connection = useConnection();
  let dragCompatibility: ReturnType<typeof computePortDragCompatibility> | null = null;
  if (connection.inProgress && connection.fromNode.id !== id) {
    const sourceData = connection.fromNode.data as GraphNodeData | undefined;
    const sourceType = sourceData?.nodeType;
    const sourcePort = sourceType ? outputPortsFor({ type: sourceType, config: sourceData?.config })[0] : undefined;
    const targetPort = inputPortsFor({ type })[0];
    if (sourcePort && targetPort) {
      dragCompatibility = acceptsAnyKind(declaredInputs)
        ? "compatible"
        : computePortDragCompatibility(sourcePort.contract.kind, targetPort.contract.kind);
    }
  }
  const targetHandleStyle: CSSProperties =
    dragCompatibility === "compatible"
      ? { ...handleStyle, boxShadow: `0 0 0 4px ${color.success[500]}`, transform: "scale(1.15)" }
      : dragCompatibility === "needs-transform"
        ? { ...handleStyle, boxShadow: `0 0 0 4px ${color.warning[500]}` }
        : dragCompatibility === "incompatible"
          ? { ...handleStyle, opacity: 0.3 }
          : handleStyle;

  const issueColor = compileIssue?.severity === "error" ? color.error[600] : color.warning[600];
  const heat = nodeData.heat;
  const borderColor = heat
    ? heat.color
    : nodeStatus !== "idle"
      ? statusColor[nodeStatus]
      : compileIssue
        ? issueColor
        : tokens.border;
  const running = nodeStatus === "running";

  const cardStyle: CSSProperties = {
    position: "relative",
    width: NODE_CARD_WIDTH,
    maxHeight: NODE_CARD_MAX_HEIGHT,
    boxSizing: "border-box",
    padding: `10px ${spacing[3]}px`,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    // Heatmap view: the metric colour washes over the type background.
    background: heat ? `linear-gradient(0deg, ${heat.color}33, ${heat.color}33), ${tokens.bg}` : tokens.bg,
    border: `2px solid ${borderColor}`,
    color: text.primary,
    opacity: dimmed ? 0.35 : 1,
    boxShadow: running ? shadow.runningGlow : nodeTypeGlow(tokens.accent),
    fontFamily: fontFamily.ui,
    outline: selected ? `2px solid ${color.primary[500]}` : "2px solid transparent",
    outlineOffset: 3,
    transition: `border-color ${shell.motion.fast}ms, box-shadow ${shell.motion.fast}ms, outline-color ${shell.motion.fast}ms, opacity ${shell.motion.standard}ms`,
    overflow: "hidden",
    ...shapeStyles(type),
  };

  const title = boundTitle ?? nodeData.label;
  const typeTitle = (NODE_TYPE_TAXONOMY[type]?.title ?? type).replace(/ node$/i, "");
  const duration = formatDuration(nodeData.traceSummary?.durationMs);

  return (
    <div
      style={{ position: "relative", display: "inline-block", background: "transparent", pointerEvents: "none" }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10}>
        <div role="toolbar" aria-label={`${title} actions`} style={toolbarStyle}>
          <IconButton label="Edit configuration" icon={<Settings2 size={15} />} tooltipPlacement="top" onClick={() => actions.editNode(id)} />
          {type !== "input" && (
            <IconButton label="Run from here" icon={<Play size={15} />} tooltipPlacement="top" onClick={() => actions.runFromNode(id)} />
          )}
          <IconButton label="Duplicate" icon={<Copy size={15} />} tooltipPlacement="top" onClick={() => actions.duplicateNode(id)} />
          <IconButton label="Zoom to node" icon={<Crosshair size={15} />} tooltipPlacement="top" onClick={() => actions.focusNode(id)} />
          <IconButton label="Delete" tone="destructive" icon={<Trash2 size={15} />} tooltipPlacement="top" onClick={() => actions.deleteNode(id)} />
        </div>
      </NodeToolbar>

      <NodeToolbar isVisible={hovered && !selected} position={Position.Bottom} offset={10}>
        <div role="tooltip" style={previewStyle}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>
          <div style={{ opacity: 0.7 }}>{typeTitle}{summary ? ` · ${summary}` : ""}</div>
          <div style={{ marginTop: spacing[1], color: nodeStatus === "idle" ? text.muted : statusColor[nodeStatus] }}>
            {nodeData.traceSummary
              ? `Last run: ${nodeData.traceSummary.status}${duration ? ` in ${duration}` : ""}${nodeData.statusStale ? " (before your last edit)" : ""}`
              : "Not run yet"}
          </div>
          {nodeData.traceSummary?.error && (
            <div style={{ marginTop: 2, color: color.error[500], overflowWrap: "anywhere" }}>
              {nodeData.traceSummary.error.length > 160
                ? `${nodeData.traceSummary.error.slice(0, 159)}…`
                : nodeData.traceSummary.error}
            </div>
          )}
          {compileIssue && (
            <div style={{ marginTop: 2, color: issueColor }}>
              {(compileIssue.messages?.length ?? 1)} {compileIssue.severity === "error" ? "error" : "warning"}
              {(compileIssue.messages?.length ?? 1) === 1 ? "" : "s"}: {compileIssue.caption}
            </div>
          )}
        </div>
      </NodeToolbar>

      {showTargetHandle && (
        <Handle
          type="target"
          position={targetPosition}
          title={inputs ? `Input (${inputs})` : "Input"}
          aria-label={`Connect into ${title}`}
          style={{ ...targetHandleStyle, pointerEvents: "auto" }}
        />
      )}
      <div
        style={{ ...cardStyle, pointerEvents: "auto" }}
        data-testid="graph-node-card"
        data-status={nodeStatus}
        aria-label={`${typeTitle} node: ${title}`}
      >
        {isRouter && <RouterHexagon fill={tokens.bg} stroke={borderColor} glow={running ? shadow.runningGlow : undefined} />}

        {/* Header: type + status + issues */}
        <div style={{ ...rowStyle, height: 20, position: "relative" }}>
          <Icon size={14} strokeWidth={2.25} color={tokens.accent} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ ...eyebrowStyle, color: tokens.label }}>{typeTitle}</span>
          <span style={{ flex: 1 }} />
          {heat && (
            <span data-testid="heat-badge" style={{ fontSize: 11, fontWeight: 700, lineHeight: "16px", padding: "0 6px", borderRadius: 999, background: heat.color, color: "#111318" }}>
              {heat.label}
            </span>
          )}
          {bindings.length > 0 && (
            <span
              role="img"
              aria-label={`Uses library ${bindings.map((b) => (b.kind === "prompts" ? "prompt" : "LLM profile")).join(" and ")}`}
              title="Uses a library resource"
              style={{ display: "inline-flex", color: tokens.label, opacity: 0.85 }}
            >
              <Library size={13} aria-hidden="true" />
            </span>
          )}
          {nodeStatus !== "idle" && <StatusPill status={nodeStatus} stale={nodeData.statusStale ?? false} />}
          {compileIssue && <IssueBadge issue={compileIssue} />}
        </div>

        {/* Identity */}
        <div style={{ ...ellipsisStyle, position: "relative", fontSize: 14, lineHeight: "20px", fontWeight: 600 }} title={title}>
          {title}
        </div>

        {/* Purpose / key config */}
        {summary && (
          <div style={{ ...ellipsisStyle, position: "relative", fontSize: 12, lineHeight: "16px", color: text.muted }} title={summary}>
            {summary}
          </div>
        )}

        {/* I/O contract */}
        {(inputs || outputs) && (
          <div style={{ ...rowStyle, position: "relative", marginTop: 4, fontSize: 11, lineHeight: "16px", color: color.neutral[300] }}>
            <span style={{ ...ellipsisStyle, flex: 1 }}>{inputs ? `in: ${inputs}` : ""}</span>
            <span style={{ ...ellipsisStyle, flex: 1, textAlign: "right" }}>{outputs ? `out: ${outputs}` : ""}</span>
          </div>
        )}

        {running && (
          <div
            className="agb-skeleton"
            aria-hidden="true"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3 }}
          />
        )}
      </div>
      {showSourceHandle && (
        <Handle
          type="source"
          position={sourcePosition}
          title={outputs ? `Output (${outputs})` : "Output"}
          aria-label={`Connect from ${title}`}
          style={{ ...handleStyle, pointerEvents: "auto" }}
        />
      )}
    </div>
  );
}

function StatusPill({ status, stale }: { status: NodeRunStatus; stale: boolean }) {
  const StatusIcon = STATUS_ICON[status];
  const tone = statusColor[status];
  return (
    <HoverTooltip content={stale ? "Result from before your last edit" : `Last run: ${status}`} placement="top">
      <span
        role="status"
        aria-label={stale ? `${status} (stale)` : status}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          height: 18,
          padding: "0 6px",
          borderRadius: 999,
          border: `1px ${stale ? "dashed" : "solid"} ${tone}`,
          color: tone,
          opacity: stale ? 0.6 : 1,
          fontSize: 10,
          lineHeight: "16px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          whiteSpace: "nowrap",
          pointerEvents: "auto",
        }}
      >
        {status === "running" ? (
          <span className="agb-pulse" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: tone }} />
        ) : (
          StatusIcon && <StatusIcon size={11} aria-hidden="true" />
        )}
        {status}
      </span>
    </HoverTooltip>
  );
}

function IssueBadge({ issue }: { issue: CompileIssue }) {
  const messages = issue.messages ?? [issue.caption];
  const tone = issue.severity === "error" ? color.error[500] : color.warning[500];
  const BadgeIcon = issue.severity === "error" ? XCircle : AlertTriangle;
  return (
    <HoverTooltip
      placement="top"
      content={
        <div>
          {messages.slice(0, 6).map((message, index) => (
            <div key={index} style={{ marginTop: index === 0 ? 0 : 2 }}>
              • {message}
            </div>
          ))}
          {messages.length > 6 && <div style={{ opacity: 0.7 }}>…and {messages.length - 6} more</div>}
        </div>
      }
    >
      <span
        aria-label={`${messages.length} ${issue.severity === "error" ? "error" : "warning"}${messages.length === 1 ? "" : "s"}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          height: 18,
          padding: "0 5px",
          borderRadius: 999,
          background: issue.severity === "error" ? "rgba(226, 100, 90, 0.16)" : "rgba(232, 188, 74, 0.16)",
          color: tone,
          fontSize: 11,
          fontWeight: 700,
          pointerEvents: "auto",
        }}
      >
        <BadgeIcon size={11} aria-hidden="true" />
        {messages.length}
      </span>
    </HoverTooltip>
  );
}

function RouterHexagon({ fill, stroke, glow }: { fill: string; stroke: string; glow?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        filter: glow ? "drop-shadow(0 0 6px rgba(216, 169, 44, 0.6))" : "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4))",
      }}
    >
      <polygon
        points="7,1 93,1 99,50 93,99 7,99 1,50"
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
};

const ellipsisStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const eyebrowStyle: CSSProperties = {
  ...ellipsisStyle,
  fontSize: 10,
  lineHeight: "14px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: 3,
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.panel,
  boxShadow: shadow[4],
};

const previewStyle: CSSProperties = {
  width: 240,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderRadius: radius.lg,
  border: `1px solid ${surface.borderStrong}`,
  background: surface.panel,
  color: text.primary,
  boxShadow: shadow[4],
  fontSize: 12,
  lineHeight: "16px",
  pointerEvents: "none",
};
