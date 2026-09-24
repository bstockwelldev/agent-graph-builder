import type { Edge, Node } from "@xyflow/react";
import type { GraphGroup, NodeType } from "@bstockwelldev/agent-graph-sdk";

/**
 * Visual groups (large-graph complexity, Wave 7b / STO-611). Groups are
 * display-only: a frame around a set of nodes that can collapse to a single
 * card. Everything here is pure so GraphEditor only wires state through it.
 *
 * Frames are React Flow nodes of type `groupFrame` whose ids are prefixed
 * with FRAME_PREFIX; they never enter GraphEditor's `nodes` state (so they
 * can't leak into the saved graph, dagre layout, or validation) -- they are
 * derived per render from `groups` + member positions.
 */

export const FRAME_PREFIX = "group:";
export const GROUP_PADDING = 24;
export const GROUP_HEADER = 32;
export const COLLAPSED_CARD = { width: 220, height: 76 } as const;
const DEFAULT_NODE_SIZE = { width: 240, height: 96 } as const;

export type GroupColorId = "slate" | "blue" | "green" | "amber" | "red" | "violet";

/** Six swatches for the group Color menu, all from graph-theme tokens. */
export const GROUP_COLORS: Record<GroupColorId, string> = {
  slate: "#8b909c",
  blue: "#8fbaff",
  green: "#3cb873",
  amber: "#e8bc4a",
  red: "#e2645a",
  violet: "#d88cc8",
};

export function groupColor(group: Pick<GraphGroup, "color">): string {
  return GROUP_COLORS[(group.color ?? "slate") as GroupColorId] ?? GROUP_COLORS.slate;
}

export const frameNodeId = (groupId: string) => `${FRAME_PREFIX}${groupId}`;
export const isFrameNodeId = (id: string) => id.startsWith(FRAME_PREFIX);
export const groupIdFromFrame = (id: string) => id.slice(FRAME_PREFIX.length);

export type Bounds = { x: number; y: number; width: number; height: number };

type Positioned = Pick<Node, "id" | "position"> & { measured?: { width?: number; height?: number }; width?: number; height?: number };

/** Frame rectangle around a group's members (padding + a header strip),
 * or null when none of its members exist on the canvas. */
export function groupBounds(group: GraphGroup, nodes: Positioned[]): Bounds | null {
  const members = new Set(group.node_ids);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    if (!members.has(node.id)) continue;
    const width = node.measured?.width ?? node.width ?? DEFAULT_NODE_SIZE.width;
    const height = node.measured?.height ?? node.height ?? DEFAULT_NODE_SIZE.height;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
  }
  if (minX === Infinity) return null;
  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING - GROUP_HEADER,
    width: maxX - minX + GROUP_PADDING * 2,
    height: maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER,
  };
}

/** Which group (if any) owns a node. Groups are flat and non-overlapping. */
export function groupOfNode(groups: GraphGroup[], nodeId: string): GraphGroup | undefined {
  return groups.find((group) => group.node_ids.includes(nodeId));
}

/** Put `nodeIds` into a new group, taking them out of any group they were
 * in (groups can't overlap) and dropping groups that end up empty. */
export function groupSelection(groups: GraphGroup[], nodeIds: string[], id: string, label: string): GraphGroup[] {
  const picked = new Set(nodeIds);
  const remaining = groups
    .map((group) => ({ ...group, node_ids: group.node_ids.filter((nodeId) => !picked.has(nodeId)) }))
    .filter((group) => group.node_ids.length > 0);
  return [...remaining, { id, label, color: null, node_ids: [...picked], collapsed: false }];
}

export function ungroup(groups: GraphGroup[], groupId: string): GraphGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

export function updateGroup(groups: GraphGroup[], groupId: string, patch: Partial<Omit<GraphGroup, "id">>): GraphGroup[] {
  return groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group));
}

/** Groups as they should be saved: members that no longer exist are
 * dropped (so deleting a node never leaves a dangling reference), and so
 * are groups left with no members. */
export function pruneGroups(groups: GraphGroup[], nodeIds: Iterable<string>): GraphGroup[] {
  const existing = new Set(nodeIds);
  return groups
    .map((group) => ({ ...group, node_ids: group.node_ids.filter((id) => existing.has(id)) }))
    .filter((group) => group.node_ids.length > 0);
}

/** Expand the collapsed group that hides `nodeId`, if any (Find, Health
 * and diagnostic focus reveal their target first). Returns the same array
 * when nothing changes. */
export function revealNodeInGroups(groups: GraphGroup[], nodeId: string): GraphGroup[] {
  const owner = groupOfNode(groups, nodeId);
  if (!owner || !owner.collapsed) return groups;
  return updateGroup(groups, owner.id, { collapsed: false });
}

export function nextGroupId(groups: GraphGroup[]): string {
  let n = groups.length + 1;
  const taken = new Set(groups.map((group) => group.id));
  while (taken.has(`group_${n}`)) n += 1;
  return `group_${n}`;
}

export type GroupFrameData = {
  groupId: string;
  label: string;
  color: string;
  count: number;
  collapsed: boolean;
  /** Member node types, in canvas order, for the collapsed card's strip. */
  memberTypes: NodeType[];
  dimmed: boolean;
  /** Rerouted edge handles face the same way as the members' handles. */
  horizontal: boolean;
  /** Header shows an inline name input (context menu → Rename). */
  renaming?: boolean;
};

type MemberNode = Positioned & { data: { nodeType: NodeType }; sourcePosition?: Node["sourcePosition"] };

/**
 * Frame nodes for the canvas. Expanded groups get a frame sized to their
 * members, drawn behind them; collapsed groups get a compact card at the
 * frame's top-left. `litNodeIds` (Find/Impact/dependency view) dims
 * frames with no lit members.
 */
export function buildGroupFrameNodes(
  groups: GraphGroup[],
  nodes: MemberNode[],
  litNodeIds: Set<string> | null,
): Node<GroupFrameData>[] {
  const frames: Node<GroupFrameData>[] = [];
  for (const group of groups) {
    const bounds = groupBounds(group, nodes);
    if (!bounds) continue;
    const members = nodes.filter((node) => group.node_ids.includes(node.id));
    const size = group.collapsed ? COLLAPSED_CARD : { width: bounds.width, height: bounds.height };
    const sourcePosition = members[0]?.sourcePosition;
    frames.push({
      id: frameNodeId(group.id),
      type: "groupFrame",
      position: { x: bounds.x, y: bounds.y },
      width: size.width,
      height: size.height,
      style: { width: size.width, height: size.height, ...(group.collapsed ? {} : { pointerEvents: "none" as const }) },
      zIndex: group.collapsed ? 0 : -1,
      // Expanded frames drag by their header only (the body passes pointer
      // events through to the pane); a collapsed card drags from anywhere.
      ...(group.collapsed ? {} : { dragHandle: ".agb-group-handle" }),
      selectable: false,
      connectable: false,
      data: {
        groupId: group.id,
        label: group.label,
        color: groupColor(group),
        count: members.length,
        collapsed: Boolean(group.collapsed),
        memberTypes: members.map((node) => node.data.nodeType),
        dimmed: litNodeIds !== null && !members.some((node) => litNodeIds.has(node.id)),
        horizontal: sourcePosition === undefined || sourcePosition === "right" || sourcePosition === "left",
      },
    });
  }
  return frames;
}

/** Members of collapsed groups are hidden on the canvas (not removed). */
export function hideCollapsedMembers<T extends Node>(nodes: T[], groups: GraphGroup[]): T[] {
  const hidden = new Set(groups.filter((group) => group.collapsed).flatMap((group) => group.node_ids));
  if (hidden.size === 0) return nodes;
  return nodes.map((node) => (hidden.has(node.id) ? { ...node, hidden: true } : node));
}

export type RoutedEdgeData = { mergedCount?: number; mergedEdgeIds?: string[] };

/**
 * Edges as drawn when some groups are collapsed: an endpoint inside a
 * collapsed group moves to that group's card, edges wholly inside one
 * collapsed group disappear, and edges that end up with the same
 * endpoints merge into one (carrying `mergedCount` for the badge).
 */
export function rerouteEdgesForCollapsedGroups(edges: Edge[], groups: GraphGroup[]): Edge[] {
  const owner = new Map<string, string>();
  for (const group of groups) {
    if (!group.collapsed) continue;
    for (const nodeId of group.node_ids) owner.set(nodeId, frameNodeId(group.id));
  }
  if (owner.size === 0) return edges;

  const result: Edge[] = [];
  const byEndpoints = new Map<string, number>();
  for (const edge of edges) {
    const source = owner.get(edge.source) ?? edge.source;
    const target = owner.get(edge.target) ?? edge.target;
    if (source === target) continue; // internal to one collapsed group
    if (source === edge.source && target === edge.target) {
      result.push(edge);
      continue;
    }
    const key = `${source}\u0000${target}`;
    const existing = byEndpoints.get(key);
    if (existing !== undefined) {
      const merged = result[existing];
      const data = (merged.data ?? {}) as RoutedEdgeData;
      result[existing] = {
        ...merged,
        data: { ...merged.data, mergedCount: (data.mergedCount ?? 1) + 1, mergedEdgeIds: [...(data.mergedEdgeIds ?? [merged.id]), edge.id] },
      };
      continue;
    }
    byEndpoints.set(key, result.length);
    result.push({ ...edge, source, target, sourceHandle: null, targetHandle: null, data: { ...edge.data, mergedCount: 1, mergedEdgeIds: [edge.id] } });
  }
  return result;
}
