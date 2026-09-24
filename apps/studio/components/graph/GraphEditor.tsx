"use client";

import { scrollBehavior } from "@/lib/motion";
import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Activity, BookOpen, FlaskConical, Focus, HelpCircle, ListChecks, MoreHorizontal, Play, Plus, Search, ShieldCheck, Sparkles, Tag, Workflow, X } from "lucide-react";
import {
  fingerprintGraph,
  fingerprintGraphSemantics,
  nodeBindings,
  type ChatProvider,
  type Diagnostic,
  type EdgeKind,
  type GraphDefinition,
  type GraphEdge,
  type GraphGroup,
  type GraphHealth,
  type GraphNode,
  type GraphOrientation,
  type NodeTrace,
  type NodeType,
  type PlatformEvent,
  type RouteDecision,
  type RunSummary,
} from "@bstockwelldev/agent-graph-sdk";

import { client, streamRunEvents } from "@/lib/api-client";
import { consumeCanvasFocus, describePlatformEvent, logConsoleEntry } from "@/lib/consoleLog";
import { exportGraphJson, importGraphJson } from "@/lib/graphJsonPortability";
import {
  applyCompileIssueToEdge,
  applyCompileIssueToNodeData,
  buildIssueMaps,
  diagnosticsForEdge,
  diagnosticsForNode,
  edgeStrokeForKind,
  fingerprintIssueMaps,
  tabForDiagnostic,
  validationSummary,
} from "@/lib/diagnostics";
import {
  cloneCanvasSnapshot,
  coachStep,
  dismissCoach,
  isCoachDismissed,
  isCoachVisible,
  isEditableKeyboardTarget,
} from "@/lib/graphAuthoring";
import { boundTitleFor, defaultConfig, labelFor, nodeLabel, withUserLabel } from "@/lib/nodeDefaults";
import { applyRunSelectionToLlmNodes } from "@/lib/modelCatalog";
import { computeAncestorNodeIds } from "@/lib/runFromNode";
import { runInputVariables } from "@/lib/runInputs";
import { RESOURCE_PANEL, ResourceNamesProvider, useResourceNamesMap } from "./resourceBindings";
import { computeFocusNodeIds, type FocusDirection } from "@/lib/graphFocus";
import {
  GROUP_COLORS,
  buildGroupFrameNodes,
  groupIdFromFrame,
  groupOfNode,
  groupSelection,
  hideCollapsedMembers,
  isFrameNodeId,
  nextGroupId,
  pruneGroups,
  rerouteEdgesForCollapsedGroups,
  revealNodeInGroups,
  ungroup,
  updateGroup,
  type GroupColorId,
} from "@/lib/graphGroups";
import { buildExecutedPath, edgeStrokeForInspection, normalizeRouteDecisions, tracesFromEvents } from "@/lib/runInspection";
import {
  failedUnavailableRunSummary,
  isRunNotFoundError,
  isTerminalRunStatus,
  RUN_NOT_FOUND_HINT,
  watchRunCompletion,
} from "@/lib/watchRun";
import { useUndoStack } from "@/hooks/useUndoStack";
import { useWorkbench } from "@/components/workbench/WorkbenchProvider";
import { WorkbenchDrawer } from "@/components/workbench/WorkbenchDrawer";
import type { WorkbenchPanelId } from "@/components/workbench/panels";
import { EdgeInspector, NodeInspector } from "./NodeInspector";
import { WorkflowSummary } from "./WorkflowSummary";
import { NodePalette, NODE_TYPES as NODE_TYPES_FOR_CONTEXT_MENU } from "./NodePalette";
import { ConnectKindMenu } from "./ConnectKindMenu";
import { NodeContextMenu, menuAnchorFor, type NodeContextMenuAction } from "./NodeContextMenu";
import { MOBILE_TAB_BAR_HEIGHT, MobileTabBar } from "@/components/navigation/mobile-tab-bar";
import { NODE_TYPE_TAXONOMY } from "@/content/taxonomy";
import { EmptyGraphCoach } from "./EmptyGraphCoach";
import { FlowCanvas } from "./FlowCanvas";
import { RunPanel, type RunSelection } from "./RunPanel";
import { FindBar } from "./FindBar";
import { HealthPanel } from "./HealthPanel";
import { KnowledgePanel } from "./KnowledgePanel";
import { PolicyPanel } from "./PolicyPanel";
import { ReleasesPanel } from "./ReleasesPanel";
import { RoutingLabPanel } from "./RoutingLabPanel";
import { GraphSwitcherCombobox } from "./GraphSwitcherCombobox";
import { GraphNodeView, type GraphNodeData, type NodeTraceSummary } from "./nodes/GraphNodeView";
import { GroupFrame } from "./nodes/GroupFrame";
import { GraphHeader, type RunPanelSectionId } from "./GraphHeader";
import { IconButton } from "./ui/IconButton";
import { CanvasActionsProvider, type CanvasActions } from "./canvasActions";
import type { EdgeRunState } from "./edges/LabeledEdge";
import { findFreePosition, type LayoutSpacing } from "@/layout/dagreLayout";
import { cn } from "@/lib/utils";
import { shell } from "@/lib/graph-theme";
import { parseGraphUrlState, serializeGraphUrlState } from "@/lib/graphUrlState";
import { WORKBENCH_PANELS } from "@/components/workbench/panels";
import { CaptureDatasetDialog } from "@/components/studio/capture-dataset-dialog";

// Layout-menu view preferences (studio-graph-workbench-redesign-plan.md,
// Slice 3) -- per viewer, not per graph, so they live in localStorage
// rather than the graph document. Every access is guarded: storage can be
// unavailable (private mode, blocked site data) and the defaults must hold.
const LAYOUT_SPACING_STORAGE_KEY = "agb.layout.spacing";
const SHOW_MINIMAP_STORAGE_KEY = "agb.layout.showMinimap";

function readStoredSpacing(): LayoutSpacing {
  try {
    const value = window.localStorage.getItem(LAYOUT_SPACING_STORAGE_KEY);
    return value === "compact" || value === "relaxed" ? value : "standard";
  } catch {
    return "standard";
  }
}

function readStoredShowMinimap(): boolean {
  try {
    return window.localStorage.getItem(SHOW_MINIMAP_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference just won't persist -- not worth surfacing.
  }
}

/** True when the viewport is wide enough for docked (non-drawer) panels. */
function isDesktopViewport(): boolean {
  return typeof window === "undefined" || window.innerWidth >= shell.breakpoint.compact;
}

// The node/edge inspector (and, when nothing is selected, the workflow
// summary) shares its HUD slot with these four panels (see
// showSelectionDock below), gating the dock's own render.
const INSPECTOR_EXCLUSIVE_PANELS = new Set<WorkbenchPanelId | null>(["run", "releases", "routingLab", "knowledge", "policies", "health"]);

// Compact/mobile selection dock positioning. The dock used to anchor at a
// hardcoded `top-24` (96px) regardless of the HUD's actual rendered
// height — on any width where the HUD wraps to 2+ rows (increasingly
// likely as HUD buttons are added), the dock overlapped and hid the HUD
// instead of sitting below it, and a `max-h-[75vh]` cap made it look like
// it covered the whole viewport on shorter phones. Reusing `hudBottom`
// (already measured via ResizeObserver for EmptyGraphCoach's positioning,
// below) fixes the overlap; bounding height to the *actual* remaining
// viewport, not a flat vh percentage, fixes the "covers everything" feel.
const COMPACT_DOCK_TOP_GAP_PX = 16;
/** Clears the bottom mobile action bar (`bottom-4` + its own height) plus margin. */
const COMPACT_DOCK_BOTTOM_RESERVE_PX = 96;

// Phase 10 Slice A follow-up (docs/planning/features/studio-shell-ux-gap-analysis.md):
// selecting a node/edge on canvas already closed "palette" (so the add-node
// list doesn't linger over a now-selected node) but never
// run/releases/routingLab, so the inspector stayed hidden behind whichever
// of those was open until the user closed it manually first. Closing any
// panel in this superset on selection fixes that friction.
const CLOSE_ON_CANVAS_SELECTION_PANELS = new Set<WorkbenchPanelId | null>([
  "palette",
  ...INSPECTOR_EXCLUSIVE_PANELS,
]);

const nodeTypes = {
  input: GraphNodeView,
  prompt: GraphNodeView,
  llm: GraphNodeView,
  tool: GraphNodeView,
  router: GraphNodeView,
  output: GraphNodeView,
  guardrail: GraphNodeView,
  rubric: GraphNodeView,
  branch: GraphNodeView,
  tool_loop: GraphNodeView,
  code_exec: GraphNodeView,
  human_gate: GraphNodeView,
  // Wave 7b: derived visual group frames (never in `nodes` state).
  groupFrame: GroupFrame,
};

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function syncIdCounter(graph: GraphDefinition) {
  let max = idCounter;
  for (const item of [...graph.nodes, ...graph.edges]) {
    const match = item.id.match(/_(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  idCounter = max;
}

function toFlowNode(n: GraphNode): Node<GraphNodeData> {
  const userLabel = typeof n.extensions?.label === "string" ? n.extensions.label : undefined;
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: {
      nodeType: n.type,
      label: nodeLabel(n.type, n.config, userLabel),
      userLabel,
      extensions: n.extensions ?? undefined,
      config: n.config,
      status: "idle",
      compileIssue: null,
    },
  };
}

// Edge labels/animation are rendered by edges/LabeledEdge.tsx from `data`
// (studio-graph-workbench-redesign-plan.md, Slice 6) -- no stock `label`,
// and no kind-based `animated` (animation now means "executing").
function toFlowEdge(e: GraphEdge): Edge {
  const { stroke, strokeWidth } = edgeStrokeForKind(e.kind);
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    style: { stroke, strokeWidth },
    data: { kind: e.kind, condition: e.condition ?? null },
  };
}

function createFlowEdge(connection: Connection, kind: EdgeKind, condition: string | null): Edge {
  const { stroke, strokeWidth } = edgeStrokeForKind(kind);
  return {
    id: nextId("e"),
    source: connection.source!,
    target: connection.target!,
    style: { stroke, strokeWidth },
    data: { kind, condition },
  };
}

/** Hover-preview digest of a node's trace (Slice 4). */
function traceSummaryFor(trace: NodeTrace): NodeTraceSummary {
  const started = trace.started_at ? Date.parse(trace.started_at) : Number.NaN;
  const completed = trace.completed_at ? Date.parse(trace.completed_at) : Number.NaN;
  return {
    status: trace.status,
    durationMs: Number.isFinite(started) && Number.isFinite(completed) ? Math.max(0, completed - started) : null,
    error: trace.error ?? null,
  };
}

/** Number of outgoing conditional/fallback routes per node, for router
 * summaries ("3 routes") on the node card. */
function routeCounts(edges: Edge[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of edges) counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
  return counts;
}

export function GraphEditor({ graphId }: { graphId: string }) {
  const router = useRouter();
  const [graphName, setGraphName] = useState("");
  const [graphOrientation, setGraphOrientation] = useState<GraphOrientation>("auto");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // Mobile selection dock fix: the "nothing selected" workflow summary used
  // to force-render as a full-viewport sheet on every compact page load
  // (no dismiss short of tapping a backdrop it mostly covered, and no close
  // button at all in that state). It now defaults to a small collapsed
  // strip; this tracks whether the user tapped it open.
  const [mobileSummaryExpanded, setMobileSummaryExpanded] = useState(false);
  // Selecting a node/edge (e.g. tapping one directly on canvas, not via
  // this dock's own close/backdrop handlers) should always show that
  // selection's inspector next, not a stale expanded-summary state from
  // before.
  useEffect(() => {
    if (selectedNodeId || selectedEdgeId) setMobileSummaryExpanded(false);
  }, [selectedNodeId, selectedEdgeId]);
  // Phase 10 Slice D ("Focus mode" -- docs/planning/features/
  // studio-shell-ux-gap-analysis.md). Off by default and restrained per
  // studio-ux-revision-plan.md's "must not make the graph unreadable when
  // users need broad context" -- it only dims anything once a node is
  // both selected AND this is on (see the effect below).
  const [focusMode, setFocusMode] = useState(false);
  // Large-graph complexity, Wave 7a (STO-610): find-on-canvas matches, the
  // Impact tab's downstream highlight, and a directional dependency view.
  // Each keeps its node set lit and dims the rest (see the effect below).
  const [findOpen, setFindOpen] = useState(false);
  const [findMatches, setFindMatches] = useState<string[] | null>(null);
  const [impactHighlight, setImpactHighlight] = useState<string[] | null>(null);
  const [dependencyView, setDependencyView] = useState<{ nodeId: string; direction: FocusDirection } | null>(null);
  // Wave 7b (STO-611): display-only visual groups. Frames are derived from
  // these + member positions at render time (lib/graphGroups.ts).
  const [groups, setGroups] = useState<GraphGroup[]>([]);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [health, setHealth] = useState<GraphHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [coachDismissed, setCoachDismissed] = useState(false);
  // Bug fix: EmptyGraphCoach used a fixed 12px top offset, so it rendered
  // directly underneath/behind the floating top HUD (same absolute-position
  // coordinate frame, no reserved flow space for either) instead of below
  // it. The HUD's height is dynamic — it wraps to two rows once its button
  // group no longer fits, and drops a whole row in compact/mobile mode — so
  // a bigger fixed offset would either still collide at some widths or
  // leave a needless gap at others. Measuring the HUD's real rendered
  // bottom edge (its `offsetTop`, which is 0 unless the `top-4` Tailwind
  // class above changes, plus `offsetHeight`) keeps the coach panel
  // correctly clear of the HUD at every width without duplicating that
  // class's value here.
  const hudRef = useRef<HTMLDivElement | null>(null);
  const [hudBottom, setHudBottom] = useState<number | null>(null);
  const [relayoutNonce, setRelayoutNonce] = useState(0);
  // Layout menu (studio-graph-workbench-redesign-plan.md, Slice 3). Read
  // from storage after mount, not in the initializer, so server and first
  // client render agree.
  const [layoutSpacing, setLayoutSpacing] = useState<LayoutSpacing>("standard");
  const [showMinimap, setShowMinimap] = useState(true);
  useEffect(() => {
    setLayoutSpacing(readStoredSpacing());
    setShowMinimap(readStoredShowMinimap());
  }, []);
  const [fitViewNonce, setFitViewNonce] = useState(0);
  const viewportCenterRef = useRef<(() => { x: number; y: number }) | null>(null);
  // Header Run▾ menu and node toolbar → RunPanel (Slice 2/4): RunPanel owns
  // its run inputs and only mounts while open, so requests are handed over
  // as nonce-keyed props it consumes on mount/change.
  const [runSectionRequest, setRunSectionRequest] = useState<{ sectionId: RunPanelSectionId; nonce: number } | null>(null);
  // Mobile tray "More" menu anchor (STO-607).
  const [trayMenuAnchor, setTrayMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [runFromNodeRequest, setRunFromNodeRequest] = useState<{ nodeId: string; nonce: number } | null>(null);
  // Screen-reader announcements from the canvas (orientation changes) --
  // previously passed as no-op stubs, so they were silently dropped.
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  // Wave 2: RunPanel's history multi-select → dataset capture dialog
  // (ported from the retired /runs/[graphId] page).
  const [captureRuns, setCaptureRuns] = useState<RunSummary[] | null>(null);
  // Wave 2 URL state (lib/graphUrlState.ts): the node inspector's active
  // tab, mirrored into `?tab=`; and whether this graph's URL state has been
  // applied yet (writes are held until then so they can't wipe the link).
  const [inspectorTab, setInspectorTab] = useState<string | null>(null);
  const urlStateAppliedRef = useRef<string | null>(null);
  const [libraryGraphs, setLibraryGraphs] = useState<GraphDefinition[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const workbench = useWorkbench();
  // Default the Run panel open on desktop, matching the old playground's
  // persistently docked Run rail; computed once at mount, not tied to live
  // resize, so a window resize doesn't fight a user's manual toggle
  // (studio-consolidation Phase 7). Palette/library/run are now one
  // mutually-exclusive `activePanel` (Phase 8) rather than three
  // independent booleans — they previously rendered at the identical
  // top-24/left-4 position when more than one was open, an unnoticed
  // Phase 7 overlap bug this also fixes.
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [runHistory, setRunHistory] = useState<RunSummary[]>([]);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [nodeTraces, setNodeTraces] = useState<Record<string, NodeTrace>>({});
  const [inspectionRunId, setInspectionRunId] = useState<string | null>(null);
  const [inspectionRouteDecisions, setInspectionRouteDecisions] = useState<RouteDecision[]>([]);
  const [inspectLoadError, setInspectLoadError] = useState(false);
  const [providerBlockMessage, setProviderBlockMessage] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{
    connection: Connection;
    x: number;
    y: number;
    targetLabel: string;
  } | null>(null);
  const shiftConnectRef = useRef(false);
  const connectPointerRef = useRef({ x: 0, y: 0 });
  const lastAppliedIssueFingerprintRef = useRef<string>("");
  const closeStreamRef = useRef<(() => void) | null>(null);
  const lastInspectAttemptRef = useRef<string | null>(null);
  const diagnosticsSectionRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Diagnostics-as-navigation (studio-ux-gap-remediation-plan.md §1).
  const [focusRequest, setFocusRequest] = useState<{ nodeId?: string | null; edgeId?: string | null; nonce: number } | null>(
    null,
  );
  const [inspectorTabRequest, setInspectorTabRequest] = useState<{ tab: string; nonce: number; nodeId: string } | null>(
    null,
  );
  const { pushSnapshot, undo, redo, clearHistory } = useUndoStack();
  const validationLabel = useMemo(() => validationSummary(diagnostics).label, [diagnostics]);

  const closeStream = useCallback(() => {
    closeStreamRef.current?.();
    closeStreamRef.current = null;
  }, []);

  const focusDiagnostics = useCallback(() => {
    diagnosticsSectionRef.current?.focus();
    diagnosticsSectionRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  }, []);

  // Diagnostics-as-navigation (studio-ux-gap-remediation-plan.md §1):
  // clicking a diagnostic already selected the node/edge; it now also pans/
  // zooms the canvas onto it and, for node diagnostics, opens the
  // NodeInspector tab that owns the offending field.
  // Shared by diagnostic clicks and the run waterfall (below) — selects a
  // node, pans/zooms the canvas onto it, and optionally forces a specific
  // NodeInspector tab.
  const focusNode = useCallback((nodeId: string, tab?: string) => {
    const nonce = Date.now();
    setGroups((current) => revealNodeInGroups(current, nodeId));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setFocusRequest({ nodeId, nonce });
    if (tab) setInspectorTabRequest({ tab, nonce, nodeId });
  }, []);

  const handleDiagnosticClick = useCallback(
    (diagnostic: Diagnostic) => {
      if (diagnostic.edge_id) {
        setSelectedEdgeId(diagnostic.edge_id);
        setSelectedNodeId(null);
        setFocusRequest({ edgeId: diagnostic.edge_id, nonce: Date.now() });
        return;
      }
      if (diagnostic.node_id) focusNode(diagnostic.node_id, tabForDiagnostic(diagnostic));
    },
    [focusNode],
  );

  // Historical run waterfall (studio-ux-gap-remediation-plan.md §2):
  // clicking a bar focuses the node and opens its trace on the Run tab.
  const handleWaterfallFocusNode = useCallback((nodeId: string) => focusNode(nodeId, "run"), [focusNode]);

  // Console panel deep links (lib/consoleLog.ts's canvas focus bridge):
  // clicking a console entry tied to a node navigates here (if this graph
  // wasn't already open) and requests a focus; this picks the request up
  // once the graph's nodes are actually loaded, since fitView needs the
  // node to exist first. Re-running on every nodes-length change is
  // harmless — consumeCanvasFocus is single-shot and returns null after
  // the first successful consume.
  useEffect(() => {
    if (!graphId || nodes.length === 0) return;
    const nodeId = consumeCanvasFocus(graphId);
    if (nodeId && nodes.some((n) => n.id === nodeId)) focusNode(nodeId);
  }, [graphId, nodes, focusNode]);

  const refreshRunHistory = useCallback(async () => {
    setRunHistoryLoading(true);
    try {
      const runs = await client.listRuns(graphId);
      setRunHistory(runs);
    } finally {
      setRunHistoryLoading(false);
    }
  }, [graphId]);

  // Re-measures on mount and whenever the HUD's own size changes (button
  // group wrapping, compact/mobile mode toggling a whole row on/off, window
  // resize). `useLayoutEffect`, like Tooltip.tsx's own measure-then-position
  // effect, so the coach panel never paints at the wrong offset first.
  useLayoutEffect(() => {
    const element = hudRef.current;
    if (!element) return;
    const measure = () => setHudBottom(element.offsetTop + element.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void refreshRunHistory();
  }, [refreshRunHistory]);

  useEffect(() => {
    // Wave 2 URL state: a deep link's own panel/selection wins over the
    // default-open Run panel (a ?node= link should show that node's dock,
    // which the Run panel would otherwise cover).
    const fromUrl = parseGraphUrlState(window.location.search);
    if (fromUrl.panel && fromUrl.panel in WORKBENCH_PANELS) {
      workbench.open(fromUrl.panel as WorkbenchPanelId);
      return;
    }
    if (fromUrl.node || fromUrl.edge) return;
    if (isDesktopViewport() && workbench.activePanel === null) workbench.open("run");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once at mount only, guarded above
  }, []);

  const refreshLibraryGraphs = useCallback(async () => {
    setLibraryLoading(true);
    try {
      setLibraryGraphs(await client.listGraphs());
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const handleGraphSwitcherOpenChange = useCallback(
    (open: boolean) => {
      if (open) void refreshLibraryGraphs();
    },
    [refreshLibraryGraphs],
  );

  const handleLibrarySelect = useCallback(
    (selectedGraphId: string) => {
      if (selectedGraphId !== graphId) router.push(`/graphs/${selectedGraphId}`);
    },
    [graphId, router],
  );

  useEffect(() => closeStream, [closeStream]);

  useEffect(() => {
    setCoachDismissed(isCoachDismissed(graphId));
  }, [graphId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftConnectRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftConnectRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    client
      .getGraph(graphId)
      .then((graph) => {
        if (cancelled) return;
        syncIdCounter(graph);
        setGraphName(graph.name);
        setGraphOrientation(graph.orientation ?? "auto");
        setNodes(graph.nodes.map(toFlowNode));
        setEdges(graph.edges.map(toFlowEdge));
        setGroups(graph.groups ?? []);
        setSavedFingerprint(fingerprintGraph(graph));
        clearHistory();
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setDiagnostics([]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId]);

  const buildGraphDefinition = useCallback(
    (nodeSource?: Node<GraphNodeData>[]): GraphDefinition => {
      const sourceNodes = nodeSource ?? nodes;
      const entryNode = sourceNodes.find((n) => n.data.nodeType === "input");
      return {
        id: graphId,
        name: graphName,
        entry_node_id: entryNode?.id ?? sourceNodes[0]?.id ?? "",
        orientation: graphOrientation,
        nodes: sourceNodes.map((n) => ({
          id: n.id,
          type: n.data.nodeType,
          position: { x: n.position.x, y: n.position.y },
          config: n.data.config,
          ...(n.data.extensions ? { extensions: n.data.extensions } : {}),
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          kind: (e.data?.kind as EdgeKind) ?? "sequence",
          condition: (e.data?.condition as string | null) ?? null,
        })),
        // Wave 7b: members deleted since grouping are dropped on the way out.
        ...(() => {
          const saved = pruneGroups(groups, sourceNodes.map((n) => n.id));
          return saved.length > 0 ? { groups: saved } : {};
        })(),
      };
    },
    [nodes, edges, graphId, graphName, graphOrientation, groups],
  );

  // Chat context binding (studio-ux-gap-remediation-plan.md §3, STO-596):
  // publish the current graph/selection/run into the workbench so ChatPanel
  // (a global panel rendered outside this tree) can attach it to messages.
  // `getGraph` stays a live closure over `buildGraphDefinition` so the
  // snapshot reflects the canvas at send time, dirty or not.
  useEffect(() => {
    if (!graphId) return;
    workbench.setGraphContext({
      graphId,
      graphName,
      getGraph: buildGraphDefinition,
      selectedNodeId,
      selectedEdgeId,
      runId: inspectionRunId ?? runSummary?.run_id ?? null,
      focusNode: (nodeId, tab) => focusNodeRef.current(nodeId, tab),
      inspectRun: (runId) => inspectRunRef.current(runId),
    });
    return () => workbench.setGraphContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId, graphName, buildGraphDefinition, selectedNodeId, selectedEdgeId, inspectionRunId, runSummary?.run_id]);

  const paintedFingerprintRef = useRef("");
  const focusNodeRef = useRef<(nodeId: string, tab?: string) => void>(() => {});
  const inspectRunRef = useRef<(runId: string) => void>(() => {});
  const semanticFingerprintRef = useRef("");
  const semanticFingerprint = useMemo(() => {
    if (nodes.length === 0) return "";
    try {
      return fingerprintGraphSemantics(buildGraphDefinition());
    } catch {
      return "";
    }
  }, [buildGraphDefinition, nodes.length]);
  semanticFingerprintRef.current = semanticFingerprint;

  const dirty = useMemo(() => {
    try {
      return fingerprintGraph(buildGraphDefinition()) !== savedFingerprint;
    } catch {
      return false;
    }
  }, [buildGraphDefinition, savedFingerprint]);

  // Debounced live validation — mirrors apps/playground/src/App.tsx's flow.
  useEffect(() => {
    if (!semanticFingerprint) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      try {
        const graph = buildGraphDefinition();
        client
          .validateGraph(graph, { signal: controller.signal })
          .then((result) => setDiagnostics(result.diagnostics))
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === "AbortError") return;
            console.error("Live validation failed:", err);
            logConsoleEntry({
              severity: "error",
              source: "Validation",
              message: `Live validation failed: ${err instanceof Error ? err.message : String(err)}`,
              graphId: graphId ?? undefined,
            });
          });
      } catch {
        // Graph not ready yet.
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [semanticFingerprint, buildGraphDefinition, graphId]);

  // P2, "Cross-cutting policy overlays" — waiving a diagnostic from
  // RunPanel doesn't change the graph, so the debounced effect above (keyed
  // on semanticFingerprint) won't re-fire on its own; this re-validates
  // immediately so the waived diagnostic's blocking:false takes effect.
  const refreshDiagnostics = useCallback(() => {
    try {
      const graph = buildGraphDefinition();
      // The `return` makes this awaitable for Phase 10 Slice C's Validate
      // button (RunPanel.tsx's onValidate prop) without changing behavior
      // for this function's original fire-and-forget callers.
      return client
        .validateGraph(graph)
        .then((result) => setDiagnostics(result.diagnostics))
        .catch((err: unknown) => {
          console.error("Diagnostics refresh failed:", err);
          logConsoleEntry({
            severity: "error",
            source: "Validation",
            message: `Diagnostics refresh failed: ${err instanceof Error ? err.message : String(err)}`,
            graphId: graphId ?? undefined,
          });
        });
    } catch {
      // Graph not ready yet.
    }
  }, [buildGraphDefinition, graphId]);

  // Wave 7a (STO-610): the health score follows diagnostics (which already
  // re-validate on every semantic edit), debounced so typing doesn't spam it.
  const refreshHealth = useCallback(() => {
    if (!graphId) return;
    let graph: GraphDefinition;
    try {
      graph = buildGraphDefinition();
    } catch {
      return;
    }
    setHealthLoading(true);
    client
      .getGraphHealth(graphId, graph)
      .then((result) => {
        setHealth(result);
        setHealthError(null);
      })
      .catch((err: unknown) => setHealthError(err instanceof Error ? err.message : String(err)))
      .finally(() => setHealthLoading(false));
  }, [buildGraphDefinition, graphId]);

  useEffect(() => {
    if (!graphId || nodes.length === 0) return;
    const timer = window.setTimeout(refreshHealth, 600);
    return () => window.clearTimeout(timer);
    // Recompute when validation results change (they track semantic edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics, graphId]);

  const applyDiagnosticsToCanvas = useCallback(
    (nextDiagnostics: Diagnostic[]) => {
      const fingerprint = `${graphId}:${fingerprintIssueMaps(nextDiagnostics)}`;
      if (fingerprint === lastAppliedIssueFingerprintRef.current) return;
      lastAppliedIssueFingerprintRef.current = fingerprint;
      const { nodeIssues, edgeIssues } = buildIssueMaps(nextDiagnostics);
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: applyCompileIssueToNodeData(node.data, nodeIssues.get(node.id)),
        })),
      );
      setEdges((eds) => eds.map((edge) => applyCompileIssueToEdge(edge, edgeIssues.get(edge.id))));
    },
    [graphId, setNodes, setEdges],
  );

  useEffect(() => {
    applyDiagnosticsToCanvas(diagnostics);
  }, [diagnostics, applyDiagnosticsToCanvas]);

  const getCanvasSnapshot = useCallback(
    () => cloneCanvasSnapshot(nodes, edges, graphName, graphOrientation, groups),
    [nodes, edges, graphName, graphOrientation, groups],
  );

  const applyCanvasSnapshot = useCallback(
    (snapshot: ReturnType<typeof getCanvasSnapshot>) => {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setGraphName(snapshot.graphName);
      setGraphOrientation(snapshot.graphOrientation);
      setGroups(snapshot.groups ?? []);
    },
    [setNodes, setEdges],
  );

  const recordMutation = useCallback(() => {
    pushSnapshot(getCanvasSnapshot());
  }, [getCanvasSnapshot, pushSnapshot]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      const needsKindMenu =
        sourceNode?.data.nodeType === "router" ||
        sourceNode?.data.nodeType === "branch" ||
        shiftConnectRef.current;

      if (needsKindMenu) {
        setPendingConnection({
          connection,
          x: connectPointerRef.current.x,
          y: connectPointerRef.current.y,
          targetLabel: targetNode?.data.label ?? connection.target ?? "target",
        });
        return;
      }

      recordMutation();
      setEdges((current) => addEdge(createFlowEdge(connection, "sequence", null), current));
    },
    [nodes, recordMutation, setEdges],
  );

  const confirmPendingConnection = useCallback(
    (kind: EdgeKind, condition: string | null) => {
      if (!pendingConnection) return;
      recordMutation();
      setEdges((current) => addEdge(createFlowEdge(pendingConnection.connection, kind, condition), current));
      setPendingConnection(null);
    },
    [pendingConnection, recordMutation, setEdges],
  );

  const patchEdgeById = useCallback(
    (edgeId: string, patch: Partial<GraphEdge>) => {
      recordMutation();
      setEdges((current) =>
        current.map((edge) => {
          if (edge.id !== edgeId) return edge;
          const kind = (patch.kind ?? (edge.data?.kind as EdgeKind)) ?? "sequence";
          const condition = patch.condition !== undefined ? patch.condition : (edge.data?.condition as string | null);
          const { stroke, strokeWidth } = edgeStrokeForKind(kind);
          return {
            ...edge,
            data: { ...edge.data, kind, condition },
            style: { stroke, strokeWidth },
          };
        }),
      );
    },
    [recordMutation, setEdges],
  );

  const deleteSelection = useCallback(() => {
    if (selectedNodeId) {
      recordMutation();
      setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
      setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
      setSelectedNodeId(null);
      return;
    }
    if (selectedEdgeId) {
      recordMutation();
      setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }, [recordMutation, selectedEdgeId, selectedNodeId, setEdges, setNodes]);

  const addNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }) => {
      recordMutation();
      const config = defaultConfig(type);
      const id = nextId(type);
      const node: Node<GraphNodeData> = {
        id,
        type,
        // Slice 5: the viewport center (or the clicked point), nudged to
        // the first spot that doesn't overlap an existing card -- was a
        // random position anywhere in a 400x400 box.
        position: findFreePosition(nodes, position ?? viewportCenterRef.current?.() ?? { x: 200, y: 120 }),
        data: { nodeType: type, label: labelFor(type, config), config, status: "idle", compileIssue: null },
      };
      setNodes((current) => [...current, node]);
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      if (workbench.activePanel === "palette") workbench.close();
    },
    [nodes, recordMutation, setNodes, workbench],
  );

  // Right-click context menu (studio-consolidation Phase 7 — new scope, no
  // equivalent existed before). Mirrors pendingConnection's {x, y} pattern.
  const [contextMenu, setContextMenu] = useState<
    | { kind: "node"; nodeId: string; x: number; y: number }
    | { kind: "edge"; edgeId: string; x: number; y: number }
    // Wave 7b: a group frame/card, or a multi-node selection box.
    | { kind: "group"; groupId: string; x: number; y: number }
    | { kind: "selection"; x: number; y: number }
    | { kind: "pane"; x: number; y: number; flowX: number; flowY: number }
    // Phase 10 Slice C follow-up, "double-click + searchable node
    // launcher" — same {x, y, flowX, flowY} shape as "pane" (right-click),
    // but rendered with a search box; see nodeLauncherQuery below.
    | { kind: "launcher"; x: number; y: number; flowX: number; flowY: number }
    | null
  >(null);
  const [nodeLauncherQuery, setNodeLauncherQuery] = useState("");

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const source = nodes.find((node) => node.id === nodeId);
      if (!source) return;
      recordMutation();
      const id = nextId(source.data.nodeType);
      const duplicate: Node<GraphNodeData> = {
        ...source,
        id,
        selected: false,
        position: findFreePosition(nodes, { x: source.position.x + 40, y: source.position.y + 40 }),
        data: { ...source.data },
      };
      setNodes((current) => [...current, duplicate]);
    },
    [nodes, recordMutation, setNodes],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFindOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const current = getCanvasSnapshot();
        const snapshot = event.shiftKey ? redo(current) : undo(current);
        if (snapshot) applyCanvasSnapshot(snapshot);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedNodeId || selectedEdgeId) {
          event.preventDefault();
          deleteSelection();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyCanvasSnapshot, deleteSelection, getCanvasSnapshot, redo, selectedEdgeId, selectedNodeId, undo]);

  const handleSave = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const graph = buildGraphDefinition();
      await client.saveGraph(graph);
      setSavedFingerprint(fingerprintGraph(graph));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [buildGraphDefinition, dirty]);

  // Raw JSON/YAML config editor, Phase 2 - graph scope
  // (studio-config-editor-and-console-plan.md §6): copy-paste/backup/
  // scripting, not a live-editing surface. Client-side only - importing
  // replaces canvas state but doesn't touch savedFingerprint, so the
  // graph is correctly `dirty` until the user explicitly Saves, same as
  // any other canvas edit.
  const handleExportGraph = useCallback(() => {
    try {
      const graph = buildGraphDefinition();
      const json = exportGraphJson(graph);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${graph.name || "graph"}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }, [buildGraphDefinition]);

  const handleImportFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const result = importGraphJson(text);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      if (dirty && !window.confirm("Importing will replace the current unsaved graph. Continue?")) {
        return;
      }
      recordMutation();
      const graph = result.graph;
      syncIdCounter(graph);
      setGraphName(graph.name);
      setGraphOrientation(graph.orientation ?? "auto");
      setNodes(graph.nodes.map(toFlowNode));
      setEdges(graph.edges.map(toFlowEdge));
      setGroups(graph.groups ?? []);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setDiagnostics([]);
      setSaveError(null);
    },
    [dirty, recordMutation, setEdges, setNodes],
  );

  const paintInspectionPath = useCallback(
    (traces: Record<string, NodeTrace>, routeDecisions: RouteDecision[]) => {
      const graphEdges: GraphEdge[] = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: (edge.data?.kind as EdgeKind) ?? "sequence",
        condition: (edge.data?.condition as string | null) ?? null,
      }));
      const path = buildExecutedPath(traces, routeDecisions, graphEdges, nodes.map((node) => node.id));
      const { nodeIssues } = buildIssueMaps(diagnostics);

      paintedFingerprintRef.current = semanticFingerprintRef.current;
      setNodes((nds) =>
        nds.map((node) => {
          const trace = traces[node.id];
          return {
            ...node,
            data: {
              ...applyCompileIssueToNodeData(node.data, nodeIssues.get(node.id)),
              status: trace?.status ?? "idle",
              statusStale: false,
              inspectionDimmed: path.dimNodeIds.has(node.id),
              traceSummary: trace ? traceSummaryFor(trace) : null,
            },
          };
        }),
      );

      setEdges((eds) =>
        eds.map((edge) => {
          const kind = (edge.data?.kind as EdgeKind) ?? "sequence";
          const { stroke, strokeWidth, opacity } = edgeStrokeForInspection(edge, path, kind);
          const sourceRan = path.executedNodeIds.has(edge.source);
          const targetStatus = traces[edge.target]?.status;
          // Slice 6: animation now means "executing right now" -- only the
          // edge into the currently running node moves; edges into a failed
          // node read as failed.
          const runState: EdgeRunState | undefined =
            sourceRan && targetStatus === "running"
              ? "active"
              : sourceRan && targetStatus === "failed"
                ? "failed"
                : path.highlightEdgeIds.has(edge.id)
                  ? "traversed"
                  : undefined;
          return {
            ...edge,
            style: { stroke, strokeWidth, opacity },
            animated: false,
            data: { ...edge.data, runState },
          };
        }),
      );
    },
    [diagnostics, edges, nodes, setEdges, setNodes],
  );

  const exitInspection = useCallback(() => {
    setInspectionRunId(null);
    setInspectionRouteDecisions([]);
    setNodeTraces({});
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, status: "idle", statusStale: false, inspectionDimmed: false, traceSummary: null },
      })),
    );
    setEdges((eds) =>
      eds.map((edge) => {
        const { stroke, strokeWidth } = edgeStrokeForKind((edge.data?.kind as EdgeKind) ?? "sequence");
        return { ...edge, style: { stroke, strokeWidth }, data: { ...edge.data, runState: undefined } };
      }),
    );
    // Force a re-apply: applyDiagnosticsToCanvas skips when the issue maps
    // haven't changed, but the edge styles were just reset above.
    lastAppliedIssueFingerprintRef.current = "";
    applyDiagnosticsToCanvas(diagnostics);
  }, [applyDiagnosticsToCanvas, diagnostics, setEdges, setNodes]);

  // Slice 4 "stale" state: once the graph is edited after a run was painted
  // onto it, that run's node statuses describe a graph that no longer
  // exists -- mark them rather than presenting them as current.
  useEffect(() => {
    if (!inspectionRunId || !paintedFingerprintRef.current) return;
    const stale = semanticFingerprint !== paintedFingerprintRef.current;
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((node) => {
        const nodeStale = stale && (node.data.status ?? "idle") !== "idle";
        if ((node.data.statusStale ?? false) === nodeStale) return node;
        changed = true;
        return { ...node, data: { ...node.data, statusStale: nodeStale } };
      });
      return changed ? next : nds;
    });
  }, [inspectionRunId, semanticFingerprint, setNodes]);

  // Router/branch "N routes" summaries (Slice 4).
  useEffect(() => {
    const counts = routeCounts(edges);
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((node) => {
        if (node.data.nodeType !== "router" && node.data.nodeType !== "branch") return node;
        const routeCount = counts.get(node.id) ?? 0;
        if (node.data.routeCount === routeCount) return node;
        changed = true;
        return { ...node, data: { ...node.data, routeCount } };
      });
      return changed ? next : nds;
    });
  }, [edges, nodes.length, setNodes]);

  // Phase 10 Slice D, "Focus mode": recompute which nodes are outside the
  // selected node's ancestor/descendant closure whenever the mode, the
  // selection, or the graph shape changes. Clears dimming entirely when
  // focus mode is off or nothing is selected.
  const focusSet = useMemo(
    () =>
      findMatches
        ? new Set(findMatches)
        : impactHighlight
          ? new Set(impactHighlight)
          : dependencyView
            ? computeFocusNodeIds(dependencyView.nodeId, edges, dependencyView.direction)
            : focusMode && selectedNodeId
              ? computeFocusNodeIds(selectedNodeId, edges)
              : null,
    [focusMode, selectedNodeId, edges, findMatches, impactHighlight, dependencyView],
  );
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const focusDimmed = focusSet !== null && !focusSet.has(node.id);
        if ((node.data.focusDimmed ?? false) === focusDimmed) return node;
        return { ...node, data: { ...node.data, focusDimmed } };
      }),
    );
  }, [focusSet, setNodes]);

  useEffect(() => {
    if (!inspectionRunId) return;
    paintInspectionPath(nodeTraces, inspectionRouteDecisions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionRunId, inspectionRouteDecisions, nodeTraces]);

  const applyRunInspection = useCallback((summary: RunSummary, traces: NodeTrace[]) => {
    closeStreamRef.current?.();
    closeStreamRef.current = null;
    setEvents(summary.events && summary.events.length > 0 ? summary.events : []);
    setRunSummary(summary);
    setInspectionRunId(summary.run_id);
    const routeDecisions = normalizeRouteDecisions(summary.route_decisions ?? []);
    setInspectionRouteDecisions(routeDecisions);
    setNodeTraces(Object.fromEntries(traces.map((trace) => [trace.node_id, trace])));
  }, []);

  const handleSelectHistoricalRun = useCallback(
    async (runId: string) => {
      lastInspectAttemptRef.current = runId;
      try {
        const [summary, traces] = await Promise.all([client.getRun(runId), client.getRunNodeTraces(runId)]);
        applyRunInspection(summary, traces);
        setInspectLoadError(false);
      } catch (err: unknown) {
        setInspectLoadError(true);
        if (isRunNotFoundError(err)) {
          setRunSummary((current) => {
            if (current?.run_id === runId) return current;
            return failedUnavailableRunSummary(
              current ?? { run_id: runId, graph_id: graphId, status: "queued", result: null },
              RUN_NOT_FOUND_HINT,
            );
          });
          return;
        }
        console.error("Failed to load run inspection:", err);
        logConsoleEntry({
          severity: "error",
          source: "Run",
          message: `Failed to load run inspection: ${err instanceof Error ? err.message : String(err)}`,
          graphId: graphId ?? undefined,
          runId,
        });
      }
    },
    [applyRunInspection, graphId],
  );

  const handleCompile = useCallback(
    async (selection: RunSelection) => {
      setCompiling(true);
      try {
        const synced = applyRunSelectionToLlmNodes(nodes, selection.provider, selection.model);
        if (synced !== nodes) setNodes(synced);
        const graph = buildGraphDefinition(synced);
        await client.saveGraph(graph);
        setSavedFingerprint(fingerprintGraph(graph));
        const result = await client.compileGraph(graph.id);
        setDiagnostics(result.diagnostics);
        if (!result.ok) focusDiagnostics();
      } finally {
        setCompiling(false);
      }
    },
    [buildGraphDefinition, focusDiagnostics, nodes, setNodes],
  );

  // Phase 10 Slice C ("Run from selected node" —
  // docs/planning/features/studio-shell-ux-gap-analysis.md): the shared
  // core `handleRun` used to be. `nodeOutputs`, when passed, pre-seeds
  // those node ids so the backend's existing fixture_node_outputs
  // mechanism short-circuits them instead of invoking their real
  // executors — see handleRunFromNode below.
  const runGraph = useCallback(
    async (opts: {
      input: Record<string, string>;
      provider: ChatProvider;
      model?: string;
      apiKey?: string;
      nodeOutputs?: Record<string, unknown>;
    }) => {
      const { input, provider, model, apiKey, nodeOutputs } = opts;
      setProviderBlockMessage(null);
      setCompiling(true);
      try {
        const needsServerKey = provider === "groq" || provider === "google" || provider === "azure";
        if (needsServerKey && !apiKey?.trim()) {
          const readiness = await client.providerReady(provider);
          if (!readiness.ready) {
            setProviderBlockMessage(readiness.message);
            return;
          }
        }

        const synced = applyRunSelectionToLlmNodes(nodes, provider, model);
        if (synced !== nodes) setNodes(synced);

        const graph = buildGraphDefinition(synced);
        await client.saveGraph(graph);
        setSavedFingerprint(fingerprintGraph(graph));
        const compileResult = await client.compileGraph(graph.id);
        setDiagnostics(compileResult.diagnostics);
        if (!compileResult.ok) {
          focusDiagnostics();
          return;
        }

        setEvents([]);
        setNodeTraces({});
        setInspectionRouteDecisions([]);
        closeStreamRef.current?.();

        const summary = await client.startRun(graph.id, input, provider, model, apiKey, nodeOutputs);
        setRunSummary(summary);
        setInspectionRunId(summary.run_id);

        const applyTerminalSummary = async (latest: RunSummary) => {
          setRunSummary(latest);
          setInspectionRouteDecisions(normalizeRouteDecisions(latest.route_decisions ?? []));
          try {
            const traces = await client.getRunNodeTraces(latest.run_id);
            setNodeTraces(Object.fromEntries(traces.map((trace) => [trace.node_id, trace])));
          } catch (err: unknown) {
            const fallback = tracesFromEvents(latest.events ?? []);
            if (fallback.length > 0) {
              setNodeTraces(Object.fromEntries(fallback.map((trace) => [trace.node_id, trace])));
            } else {
              console.error("Failed to load run traces:", err);
              logConsoleEntry({
                severity: "error",
                source: "Run",
                message: `Failed to load run traces: ${err instanceof Error ? err.message : String(err)}`,
                graphId: graphId ?? undefined,
                runId: latest.run_id,
              });
            }
          }
          await refreshRunHistory();
        };

        if (isTerminalRunStatus(summary.status)) {
          if (summary.events && summary.events.length > 0) setEvents(summary.events);
          await applyTerminalSummary(summary);
          return;
        }

        const nodeTypeById = new Map(nodes.map((n) => [n.id, n.data.nodeType]));

        closeStreamRef.current = watchRunCompletion({
          initial: summary,
          streamRunEvents,
          getRun: client.getRun,
          onEvent: (event) => {
            setEvents((evts) => [...evts, event]);
            // Mirror (not duplicate) into the app-wide console's Run events
            // tab — RunPanel's own "Event log" section still reads from
            // `events` above; this is a second, independent subscriber.
            const described = describePlatformEvent(event);
            logConsoleEntry({
              severity: described.severity,
              source: "Run",
              message: described.message,
              graphId: graphId ?? undefined,
              nodeId: event.node_id ?? undefined,
              runId: event.run_id,
            });

            if (event.event_type === "edge.selected" && event.node_id) {
              const selectedEdgeId = String(event.payload.selectedEdgeId ?? "");
              const selectedTargetNodeId = String(event.payload.selectedTargetNodeId ?? "");
              setInspectionRouteDecisions((decisions) => [
                ...decisions.filter((decision) => decision.nodeId !== event.node_id),
                { nodeId: event.node_id!, selectedEdgeId, selectedTargetNodeId },
              ]);
            }

            if (event.node_id) {
              if (event.event_type === "node.started") {
                setNodeTraces((traces) => ({
                  ...traces,
                  [event.node_id!]: {
                    node_id: event.node_id!,
                    node_type: nodeTypeById.get(event.node_id!) ?? "input",
                    status: "running",
                    input: null,
                    output: null,
                    started_at: event.occurred_at,
                  },
                }));
              } else if (event.event_type === "node.completed") {
                setNodeTraces((traces) => ({
                  ...traces,
                  [event.node_id!]: {
                    ...traces[event.node_id!],
                    node_id: event.node_id!,
                    node_type: nodeTypeById.get(event.node_id!) ?? "input",
                    status: "succeeded",
                    input: event.payload.input,
                    output: event.payload.output,
                    completed_at: event.occurred_at,
                  },
                }));
              } else if (event.event_type === "node.failed") {
                setNodeTraces((traces) => ({
                  ...traces,
                  [event.node_id!]: {
                    ...traces[event.node_id!],
                    node_id: event.node_id!,
                    node_type: nodeTypeById.get(event.node_id!) ?? "input",
                    status: "failed",
                    completed_at: event.occurred_at,
                    error: String(event.payload.error),
                  },
                }));
              }
            }

            if (event.event_type === "run.completed" || event.event_type === "run.failed") {
              closeStreamRef.current?.();
              closeStreamRef.current = null;
              void applyTerminalSummary({
                ...summary,
                status: event.event_type === "run.completed" ? "succeeded" : "failed",
                result: event.payload.result ?? summary.result,
                error: event.payload.error != null ? String(event.payload.error) : summary.error,
              });
            }
          },
          onTerminal: (latest) => {
            closeStreamRef.current = null;
            void applyTerminalSummary(latest);
          },
        });
      } finally {
        setCompiling(false);
      }
    },
    [buildGraphDefinition, focusDiagnostics, graphId, nodes, refreshRunHistory, setNodes],
  );

  const handleRun = useCallback(
    (input: Record<string, string>, provider: ChatProvider, model?: string, apiKey?: string) =>
      runGraph({ input, provider, model, apiKey }),
    [runGraph],
  );

  // Phase 10 Slice C, "Run from selected node": mocks every ancestor of
  // `nodeId` with `null` so the run skips straight to it — a structural/
  // debugging pass, not a semantically meaningful run. If the graph's
  // input node is among those ancestors (the common case), its mocked
  // output means the run input never actually reaches downstream nodes the
  // normal way; this deliberately does NOT attempt to replay a prior
  // run's real traced values for ancestors, which is a larger follow-up.
  const handleRunFromNode = useCallback(
    (nodeId: string, input: Record<string, string>, provider: ChatProvider, model?: string, apiKey?: string) => {
      const ancestorIds = computeAncestorNodeIds(
        nodeId,
        edges.map((edge) => ({ source: edge.source, target: edge.target })),
      );
      const nodeOutputs = Object.fromEntries(ancestorIds.map((id) => [id, null]));
      return runGraph({ input, provider, model, apiKey, nodeOutputs });
    },
    [edges, runGraph],
  );

  // Stable handles for graphContext's navigation actions (published in an
  // effect declared earlier than these callbacks).
  focusNodeRef.current = focusNode;
  inspectRunRef.current = (runId: string) => void handleSelectHistoricalRun(runId);

  // Header Run▾ menu / Validate chip → a specific RunPanel section
  // (studio-graph-workbench-redesign-plan.md, Slice 2).
  const openRunSection = useCallback(
    (sectionId: RunPanelSectionId) => {
      if (workbench.activePanel !== "run") workbench.open("run");
      setRunSectionRequest({ sectionId, nonce: Date.now() });
    },
    [workbench],
  );

  const handleHeaderValidate = useCallback(() => {
    void refreshDiagnostics();
    openRunSection("run-diagnostics");
  }, [openRunSection, refreshDiagnostics]);

  const deleteNodeById = useCallback(
    (nodeId: string) => {
      recordMutation();
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNodeId((current) => (current === nodeId ? null : current));
    },
    [recordMutation, setEdges, setNodes],
  );

  // Wave 7b (STO-611): visual group actions. Every one goes through
  // recordMutation so it undoes like any other canvas edit.
  const selectedNodeIdsForGrouping = useCallback((): string[] => {
    const picked = nodes.filter((node) => node.selected).map((node) => node.id);
    if (selectedNodeId && !picked.includes(selectedNodeId)) picked.push(selectedNodeId);
    return picked;
  }, [nodes, selectedNodeId]);

  const groupNodes = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length === 0) return;
      recordMutation();
      const id = nextGroupId(groups);
      setGroups((current) => groupSelection(current, nodeIds, id, `Group ${current.length + 1}`));
      setRenamingGroupId(id);
    },
    [groups, recordMutation],
  );

  const ungroupById = useCallback(
    (groupId: string) => {
      recordMutation();
      setGroups((current) => ungroup(current, groupId));
    },
    [recordMutation],
  );

  const toggleGroup = useCallback(
    (groupId: string) => {
      const group = groups.find((candidate) => candidate.id === groupId);
      if (!group) return;
      recordMutation();
      setGroups((current) => updateGroup(current, groupId, { collapsed: !group.collapsed }));
      // A collapsed member can't stay selected -- its card is hidden.
      if (!group.collapsed && selectedNodeId && group.node_ids.includes(selectedNodeId)) setSelectedNodeId(null);
    },
    [groups, recordMutation, selectedNodeId],
  );

  const renameGroup = useCallback(
    (groupId: string, label: string | null) => {
      setRenamingGroupId(null);
      const next = label?.trim();
      const group = groups.find((candidate) => candidate.id === groupId);
      if (!group || !next || next === group.label) return;
      recordMutation();
      setGroups((current) => updateGroup(current, groupId, { label: next }));
    },
    [groups, recordMutation],
  );

  const setGroupColor = useCallback(
    (groupId: string, colorId: GroupColorId) => {
      recordMutation();
      setGroups((current) => updateGroup(current, groupId, { color: colorId }));
    },
    [recordMutation],
  );

  // Frames lead the list so they paint first; collapsed members stay in
  // `nodes` (and the saved graph) but are hidden, and edges crossing a
  // collapsed boundary reattach to its card.
  const canvasNodes = useMemo(() => {
    if (groups.length === 0) return nodes;
    const frames = buildGroupFrameNodes(groups, nodes, focusSet).map((frame) =>
      frame.data.groupId === renamingGroupId ? { ...frame, data: { ...frame.data, renaming: true } } : frame,
    );
    return [...(frames as unknown as Node<GraphNodeData>[]), ...hideCollapsedMembers(nodes, groups)];
  }, [focusSet, groups, nodes, renamingGroupId]);
  const canvasEdges = useMemo(() => rerouteEdgesForCollapsedGroups(edges, groups), [edges, groups]);
  const framePositionsRef = useRef(new Map<string, { x: number; y: number }>());
  framePositionsRef.current = new Map(canvasNodes.filter((node) => isFrameNodeId(node.id)).map((node) => [node.id, node.position]));
  const frameDragRef = useRef<string | null>(null);

  // Frame nodes are derived, so their React Flow changes never reach
  // `nodes`: dragging a frame (or a collapsed card) moves its members by
  // the same delta instead, and select/remove/dimension changes are dropped.
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<GraphNodeData>>[]) => {
      const graphChanges: NodeChange<Node<GraphNodeData>>[] = [];
      for (const change of changes) {
        if (!("id" in change) || !isFrameNodeId(change.id)) {
          graphChanges.push(change);
          continue;
        }
        if (change.type !== "position") continue;
        if (!change.dragging) {
          frameDragRef.current = null;
          continue;
        }
        const previous = framePositionsRef.current.get(change.id);
        const group = groups.find((candidate) => candidate.id === groupIdFromFrame(change.id));
        if (!change.position || !previous || !group) continue;
        const dx = change.position.x - previous.x;
        const dy = change.position.y - previous.y;
        if (dx === 0 && dy === 0) continue;
        if (frameDragRef.current !== change.id) {
          frameDragRef.current = change.id;
          recordMutation();
        }
        framePositionsRef.current.set(change.id, change.position);
        const members = new Set(group.node_ids);
        setNodes((current) =>
          current.map((node) =>
            members.has(node.id) ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } } : node,
          ),
        );
      }
      if (graphChanges.length > 0) onNodesChange(graphChanges);
    },
    [groups, onNodesChange, recordMutation, setNodes],
  );

  // ⌘/Ctrl+G groups the selection; ⌘/Ctrl+Shift+G ungroups the selected
  // node's group.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "g") return;
      event.preventDefault();
      if (event.shiftKey) {
        const owner = selectedNodeId ? groupOfNode(groups, selectedNodeId) : undefined;
        if (owner) ungroupById(owner.id);
        return;
      }
      groupNodes(selectedNodeIdsForGrouping());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [groupNodes, groups, selectedNodeId, selectedNodeIdsForGrouping, ungroupById]);

  // Node toolbar + edge chip callbacks (Slices 4 and 6), provided to
  // canvas-rendered components through CanvasActionsProvider.
  const groupMenuActionsForNode = (nodeId: string): NodeContextMenuAction[] => {
    const owner = groupOfNode(groups, nodeId);
    const picked = selectedNodeIdsForGrouping();
    const ids = picked.includes(nodeId) ? picked : [nodeId];
    return [
      {
        label: ids.length > 1 ? `Group selection (${ids.length})` : "Group node",
        shortcut: "⌘G",
        separatorBefore: true,
        onClick: () => groupNodes(ids),
      },
      ...(owner ? [{ label: `Ungroup "${owner.label}"`, shortcut: "⌘⇧G", onClick: () => ungroupById(owner.id) }] : []),
    ];
  };

  const groupMenuActions = (groupId: string): NodeContextMenuAction[] => {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return [];
    return [
      { label: "Rename", onClick: () => setRenamingGroupId(groupId) },
      { label: group.collapsed ? "Expand" : "Collapse", onClick: () => toggleGroup(groupId) },
      ...(Object.keys(GROUP_COLORS) as GroupColorId[]).map((colorId, index) => ({
        label: colorId[0].toUpperCase() + colorId.slice(1),
        checked: (group.color ?? "slate") === colorId,
        separatorBefore: index === 0,
        groupLabel: index === 0 ? "Color" : undefined,
        icon: <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: GROUP_COLORS[colorId] }} />,
        onClick: () => setGroupColor(groupId, colorId),
      })),
      { label: "Ungroup", shortcut: "⌘⇧G", separatorBefore: true, onClick: () => ungroupById(groupId) },
    ];
  };

  const canvasActions = useMemo<CanvasActions>(
    () => ({
      editNode: (nodeId) => {
        if (CLOSE_ON_CANVAS_SELECTION_PANELS.has(workbench.activePanel)) workbench.close();
        focusNode(nodeId, "configure");
      },
      runFromNode: (nodeId) => {
        setSelectedNodeId(nodeId);
        setSelectedEdgeId(null);
        if (workbench.activePanel !== "run") workbench.open("run");
        setRunFromNodeRequest({ nodeId, nonce: Date.now() });
      },
      duplicateNode,
      focusNode: (nodeId) => {
        setGroups((current) => revealNodeInGroups(current, nodeId));
        setFocusRequest({ nodeId, nonce: Date.now() });
      },
      deleteNode: deleteNodeById,
      selectEdge: (edgeId) => {
        setSelectedEdgeId(edgeId);
        setSelectedNodeId(null);
        if (CLOSE_ON_CANVAS_SELECTION_PANELS.has(workbench.activePanel)) workbench.close();
      },
      toggleGroup,
      renameGroup,
    }),
    [deleteNodeById, duplicateNode, focusNode, renameGroup, toggleGroup, workbench],
  );

  // Wave 2 URL state -- apply once per graph, after its nodes load: select +
  // pan to ?node (opening ?tab) or ?edge, paint ?run onto the canvas, and
  // reveal a one-shot ?section of the Run panel (the retired /runs/[graphId]
  // page redirects here with section=observe-history).
  useEffect(() => {
    if (!graphId || loading || urlStateAppliedRef.current === graphId) return;
    urlStateAppliedRef.current = graphId;
    const state = parseGraphUrlState(window.location.search);
    // The pan/zoom waits out the load-time layout + whole-graph fit
    // (FlowCanvas's rAF and 150ms-debounced fitView), which would
    // otherwise land after it and zoom straight back out.
    const LOAD_FIT_SETTLE_MS = 400;
    if (state.node && nodes.some((node) => node.id === state.node)) {
      const nodeId = state.node;
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
      window.setTimeout(() => focusNode(nodeId, state.tab ?? undefined), LOAD_FIT_SETTLE_MS);
    } else if (state.edge && edges.some((edge) => edge.id === state.edge)) {
      const edgeId = state.edge;
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      window.setTimeout(() => setFocusRequest({ edgeId, nonce: Date.now() }), LOAD_FIT_SETTLE_MS);
    }
    if (state.run) void handleSelectHistoricalRun(state.run);
    if (state.section && state.panel === "run") {
      setRunSectionRequest({ sectionId: state.section as RunPanelSectionId, nonce: Date.now() });
    }
    // `section` is one-shot: drop it now that it's been applied, or it
    // would re-open that section on every reload.
    if (state.section) {
      const cleaned = serializeGraphUrlState(state, window.location.search);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${cleaned}${window.location.hash}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per loaded graph
  }, [graphId, loading, nodes.length]);

  // Programmatic selection (diagnostics, waterfall, event log, analytics,
  // URL deep links) set selectedNodeId/selectedEdgeId but not React Flow's
  // own `selected` flags, so the card's selection ring and NodeToolbar
  // never appeared for them. Mirror our selection into React Flow's.
  useEffect(() => {
    setNodes((nds) => {
      // Wave 7b: a Ctrl/Cmd+click that adds to React Flow's multi-selection
      // also sets selectedNodeId -- keep the rest of that selection (it's
      // what "Group selection" groups) instead of collapsing it to one.
      const keepMulti = selectedNodeId !== null && nds.some((node) => node.id === selectedNodeId && node.selected);
      let changed = false;
      const next = nds.map((node) => {
        const selected = keepMulti ? Boolean(node.selected) : node.id === selectedNodeId;
        if (Boolean(node.selected) === selected) return node;
        changed = true;
        return { ...node, selected };
      });
      return changed ? next : nds;
    });
    setEdges((eds) => {
      let changed = false;
      const next = eds.map((edge) => {
        const selected = edge.id === selectedEdgeId;
        if (Boolean(edge.selected) === selected) return edge;
        changed = true;
        return { ...edge, selected };
      });
      return changed ? next : eds;
    });
  }, [selectedNodeId, selectedEdgeId, setNodes, setEdges]);

  // Inspector tab resets with the selection (NodeInspector remounts per node).
  useEffect(() => {
    setInspectorTab(null);
  }, [selectedNodeId]);

  // ...and mirror selection/run/panel back into the URL (replaceState: no
  // history entry per click, no navigation, no re-render).
  useEffect(() => {
    if (!graphId || urlStateAppliedRef.current !== graphId) return;
    const next = serializeGraphUrlState(
      {
        node: selectedNodeId,
        edge: selectedEdgeId,
        tab: inspectorTab,
        run: inspectionRunId,
        panel: workbench.activePanel,
      },
      window.location.search,
    );
    if (next !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
    }
  }, [graphId, selectedNodeId, selectedEdgeId, inspectorTab, inspectionRunId, workbench.activePanel]);

  // ⌘S / Ctrl+S saves (new with the header's Save button, Slice 2). Runs
  // even from inside inputs -- saving while editing a field is the point.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);
  const hasSelection = Boolean(selectedNode || selectedEdge);
  const compactDockTop = (hudBottom ?? 96) + COMPACT_DOCK_TOP_GAP_PX;
  // Keep fit-to-view clear of the floating header (and, on compact, the
  // collapsed selection strip under it and the bottom action bar).
  const fitInsetTop = (hudBottom ?? 76) + COMPACT_DOCK_TOP_GAP_PX + (workbench.isCompact ? 56 : 0);
  const fitInsetBottom = workbench.isCompact ? COMPACT_DOCK_BOTTOM_RESERVE_PX : 32;
  const fitInsets = useMemo(() => ({ top: fitInsetTop, bottom: fitInsetBottom }), [fitInsetTop, fitInsetBottom]);
  const toGraphEdge = (edge: Edge): GraphEdge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: (edge.data?.kind as EdgeKind) ?? "sequence",
    condition: (edge.data?.condition as string | null) ?? null,
  });
  // Selection dock's I/O tab (Phase 10 Slice B) needs both directions for
  // any node type, not just router/branch's own branch editor.
  const selectedOutgoingEdges: GraphEdge[] = selectedNode
    ? edges.filter((edge) => edge.source === selectedNode.id).map(toGraphEdge)
    : [];
  const selectedIncomingEdges: GraphEdge[] = selectedNode
    ? edges.filter((edge) => edge.target === selectedNode.id).map(toGraphEdge)
    : [];
  const selectedTrace = selectedNodeId ? nodeTraces[selectedNodeId] ?? null : null;
  // Wave 4a: registry names for bound node cards (loaded only when the
  // graph has library bindings).
  const hasLibraryBindings = nodes.some((node) =>
    nodeBindings(node.data.nodeType, node.data.config).some((binding) => binding.kind !== "tools"),
  );
  const resourceNames = useResourceNamesMap(hasLibraryBindings);
  const showEmptyCoach = isCoachVisible(graphId, coachDismissed, nodes, edges);
  const authoringCoachStep = coachStep(nodes, edges);

  // Shared between the desktop reserved-space column and the compact
  // floating overlay below — computed once so the two render paths don't
  // duplicate the NodeInspector/EdgeInspector branch.
  const inspectorContent = selectedNode ? (
    <NodeInspector
      key={selectedNode.id}
      graphId={graphId}
      node={{
        id: selectedNode.id,
        type: selectedNode.data.nodeType,
        position: selectedNode.position,
        config: selectedNode.data.config,
      }}
      issues={diagnosticsForNode(diagnostics, selectedNode.id)}
      outgoingEdges={selectedOutgoingEdges}
      incomingEdges={selectedIncomingEdges}
      selectedTrace={selectedTrace}
      onConfigChange={(config) => {
        recordMutation();
        setNodes((nds) =>
          nds.map((n) =>
            n.id === selectedNode.id
              ? { ...n, data: { ...n.data, config, label: nodeLabel(n.data.nodeType, config, n.data.userLabel) } }
              : n,
          ),
        );
      }}
      onEdgeChange={patchEdgeById}
      onDelete={deleteSelection}
      onDuplicate={() => duplicateNode(selectedNode.id)}
      onOpenRunPanel={() => workbench.open("run")}
      onRunFromHere={() => canvasActions.runFromNode(selectedNode.id)}
      onOpenResource={(kind, resourceId) => workbench.open(RESOURCE_PANEL[kind], { resourceId })}
      templateVariables={runInputVariables(nodes)}
      onPolicyExceptionCreated={refreshDiagnostics}
      getDraftGraph={buildGraphDefinition}
      onSelectNode={(nodeId) => focusNode(nodeId)}
      onOpenReleases={() => workbench.open("releases")}
      onImpactHighlight={setImpactHighlight}
      focusTab={inspectorTabRequest}
      onTabChange={setInspectorTab}
      historyRefreshKey={runSummary ? `${runSummary.run_id}:${runSummary.status}` : null}
      onInspectRun={(runId) => void handleSelectHistoricalRun(runId)}
      userLabel={selectedNode.data.userLabel ?? ""}
      derivedLabel={
        boundTitleFor(selectedNode.data.nodeType, selectedNode.data.config, resourceNames) ??
        labelFor(selectedNode.data.nodeType, selectedNode.data.config)
      }
      onLabelChange={(value) => {
        recordMutation();
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== selectedNode.id) return n;
            const extensions = withUserLabel(n.data.extensions, value);
            // Keep the raw (untrimmed) value while typing so spaces aren't
            // eaten mid-word; withUserLabel trims what's persisted.
            const userLabel = value.trim() ? value : undefined;
            return {
              ...n,
              data: { ...n.data, extensions, userLabel, label: nodeLabel(n.data.nodeType, n.data.config, userLabel) },
            };
          }),
        );
      }}
    />
  ) : selectedEdge ? (
    <EdgeInspector
      edge={{
        id: selectedEdge.id,
        source: selectedEdge.source,
        target: selectedEdge.target,
        kind: (selectedEdge.data?.kind as EdgeKind) ?? "sequence",
        condition: (selectedEdge.data?.condition as string | null) ?? null,
      }}
      issues={diagnosticsForEdge(diagnostics, selectedEdge.id)}
      onChange={(patch) => patchEdgeById(selectedEdge.id, patch)}
      onDelete={deleteSelection}
    />
  ) : null;
  // Phase 10 Slice B: the same dock slot the inspector occupies now always
  // shows something -- WorkflowSummary when nothing is selected, per
  // studio-ux-revision-plan.md Section 6 -- rather than sitting empty.
  const showSelectionDock = !INSPECTOR_EXCLUSIVE_PANELS.has(workbench.activePanel);
  const selectionDockContent =
    selectedNode || selectedEdge ? (
      inspectorContent
    ) : (
      <WorkflowSummary
        nodes={nodes}
        edges={edges}
        diagnostics={diagnostics}
        runHistory={runHistory}
        onAddNode={(type) => addNode(type)}
        onOpenPalette={() => workbench.open("palette")}
        onRunFixture={() => workbench.open("run")}
        onSelectRun={(runId) => {
          workbench.open("run");
          void handleSelectHistoricalRun(runId);
        }}
      />
    );

  return (
    <ResourceNamesProvider value={resourceNames}>
    <div data-graph-surface="" className="relative flex min-h-0 flex-1 overflow-hidden">
      {/* Node palette — reserved-space docked column (fixing a real reported
          bug): a floating panel has no relation to node positions, so it
          could — and did — render on top of live canvas nodes near its
          screen position, blocking clicks on them. Placed first in DOM
          order so it occupies the left side of this flex row; FlowCanvas's
          existing ResizeObserver-driven `paneSize` effect
          (useCanvasOrientation + runFitView) re-fits the view to whatever
          width remains once the canvas column resizes, no extra code
          needed here. The graph switcher used to be a sibling docked panel
          here too (GraphLibrary) — replaced by the inline
          GraphSwitcherCombobox in the HUD below, since picking a different
          graph doesn't need a whole reserved column, just a popover. */}
      <WorkbenchDrawer panelId="palette" side="left" mode="docked-reserve" dockedClassName="w-72 border-r overflow-y-auto">
        <NodePalette onAdd={addNode} authoringEnabled />
      </WorkbenchDrawer>

      {/* Canvas column — everything that used to float directly on the
          canvas root now floats within this narrower column instead, so it
          shrinks along with the canvas whenever a side panel reserves
          space, rather than continuing to span the original full width. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Graph-first header (studio-graph-workbench-redesign-plan.md,
          Slice 2) -- replaces the old floating HUD of ~19 wrapping text
          buttons. Still absolutely positioned over the canvas column, so
          hudRef's measured bottom edge keeps positioning EmptyGraphCoach and
          the compact selection dock below it. */}
      <GraphHeader
        hudRef={hudRef}
        compact={workbench.isCompact}
        graphSwitcher={
          <GraphSwitcherCombobox
            graphs={libraryGraphs}
            activeGraphId={graphId}
            activeGraphName={graphName}
            loading={libraryLoading}
            onSelect={handleLibrarySelect}
            onOpenChange={handleGraphSwitcherOpenChange}
          />
        }
        graphName={graphName}
        onGraphNameChange={setGraphName}
        onBack={() => router.push("/graphs")}
        dirty={dirty}
        saving={saving}
        onSave={() => void handleSave()}
        diagnostics={diagnostics}
        onValidate={handleHeaderValidate}
        activePanel={workbench.activePanel}
        onTogglePanel={(panel) => workbench.toggle(panel)}
        onOpenRunSection={openRunSection}
        focusMode={focusMode}
        onToggleFocusMode={() => setFocusMode((value) => !value)}
        onOpenChat={() => workbench.open("chat")}
        layout={{
          orientation: graphOrientation,
          onOrientationChange: (value) => {
            recordMutation();
            setGraphOrientation(value);
          },
          onRelayout: () => {
            recordMutation();
            setRelayoutNonce((v) => v + 1);
          },
          onFitView: () => setFitViewNonce((v) => v + 1),
          spacing: layoutSpacing,
          onSpacingChange: (value) => {
            setLayoutSpacing(value);
            writeStored(LAYOUT_SPACING_STORAGE_KEY, value);
            recordMutation();
            setRelayoutNonce((v) => v + 1);
          },
          showMinimap,
          onShowMinimapChange: (value) => {
            setShowMinimap(value);
            writeStored(SHOW_MINIMAP_STORAGE_KEY, String(value));
          },
        }}
        onExport={handleExportGraph}
        onImport={() => fileInputRef.current?.click()}
        onShowShortcuts={() => workbench.toggle("help")}
        health={health}
        onOpenFind={() => setFindOpen(true)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleImportFile(file);
        }}
      />

      {saveError && (
        <div className="glass-panel ring-destructive/30 absolute left-4 top-20 z-20 max-w-sm rounded-lg p-3 ring-1">
          <p className="text-destructive text-xs">{saveError}</p>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <CanvasActionsProvider value={canvasActions}>
        <FlowCanvas
          graphId={graphId}
          nodes={nodes}
          edges={edges}
          renderNodes={canvasNodes}
          renderEdges={canvasEdges}
          setNodes={setNodes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={(event) => {
            if (event instanceof MouseEvent) {
              connectPointerRef.current = { x: event.clientX, y: event.clientY };
            } else if (event instanceof TouchEvent && event.touches[0]) {
              connectPointerRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            }
          }}
          authoringEnabled
          nodeTypes={nodeTypes}
          reducedMotion={workbench.reducedMotion}
          graphOrientation={graphOrientation}
          relayoutNonce={relayoutNonce}
          focusRequest={focusRequest}
          spacing={layoutSpacing}
          showMinimap={showMinimap && !workbench.isCompact}
          fitViewNonce={fitViewNonce}
          viewportCenterRef={viewportCenterRef}
          compact={workbench.isCompact}
          fitInsets={fitInsets}
          liveAnnouncement={liveAnnouncement}
          onLiveAnnouncement={setLiveAnnouncement}
          onClearLiveAnnouncement={() => setLiveAnnouncement("")}
          loadFailureVisible={Boolean(loadError) && nodes.length === 0}
          onRetryLoad={() => window.location.reload()}
          graphLoading={loading}
          noGraphSelected={false}
          selectedEdgeId={selectedEdgeId}
          overlay={
            <>
            <EmptyGraphCoach
              visible={showEmptyCoach}
              step={authoringCoachStep}
              hudBottom={hudBottom ?? undefined}
              onDismiss={() => {
                dismissCoach(graphId);
                setCoachDismissed(true);
              }}
            />
              {(findOpen || dependencyView) && (
                <div style={{ position: "absolute", top: (hudBottom ?? 76) + 8 + (workbench.isCompact ? 56 : 0), left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 15, pointerEvents: "none" }}>
                  {findOpen && (
                    <div style={{ pointerEvents: "auto" }}>
                      <FindBar
                        nodes={nodes}
                        onFocusNode={(nodeId) => focusNode(nodeId)}
                        onMatchesChange={setFindMatches}
                        onClose={() => setFindOpen(false)}
                      />
                    </div>
                  )}
                  {dependencyView && (
                    <div role="status" className="glass-panel" style={dependencyChipStyle}>
                      {dependencyView.direction === "upstream" ? "Upstream of" : dependencyView.direction === "downstream" ? "Downstream of" : "Dependencies of"}{" "}
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>{dependencyView.nodeId}</span>
                      <button type="button" className="agb-focus-ring" onClick={() => setDependencyView(null)} style={dependencyChipButtonStyle}>
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          }
          onNodeClick={(nodeId) => {
            if (isFrameNodeId(nodeId)) return;
            setSelectedNodeId(nodeId);
            setSelectedEdgeId(null);
            if (CLOSE_ON_CANVAS_SELECTION_PANELS.has(workbench.activePanel)) workbench.close();
          }}
          onEdgeClick={(edgeId) => {
            setSelectedEdgeId(edgeId);
            setSelectedNodeId(null);
            if (CLOSE_ON_CANVAS_SELECTION_PANELS.has(workbench.activePanel)) workbench.close();
          }}
          onPaneClick={() => {
            setPendingConnection(null);
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
          onPaneDoubleClick={(x, y, flowX, flowY) => {
            setNodeLauncherQuery("");
            setContextMenu({ kind: "launcher", x, y, flowX, flowY });
          }}
          onNodeContextMenu={(nodeId, x, y) => {
            if (isFrameNodeId(nodeId)) {
              setContextMenu({ kind: "group", groupId: groupIdFromFrame(nodeId), x, y });
              return;
            }
            setSelectedNodeId(nodeId);
            setSelectedEdgeId(null);
            setContextMenu({ kind: "node", nodeId, x, y });
          }}
          onEdgeContextMenu={(edgeId, x, y) => {
            setSelectedEdgeId(edgeId);
            setSelectedNodeId(null);
            setContextMenu({ kind: "edge", edgeId, x, y });
          }}
          onPaneContextMenu={(x, y, flowX, flowY) => {
            setContextMenu({ kind: "pane", x, y, flowX, flowY });
          }}
          onSelectionContextMenu={(x, y) => setContextMenu({ kind: "selection", x, y })}
        />
        </CanvasActionsProvider>
      </div>

      {pendingConnection && (
        <ConnectKindMenu
          x={pendingConnection.x}
          y={pendingConnection.y}
          targetLabel={pendingConnection.targetLabel}
          onConfirm={confirmPendingConnection}
          onCancel={() => setPendingConnection(null)}
        />
      )}

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          title={
            contextMenu.kind === "node"
              ? "Node"
              : contextMenu.kind === "edge"
                ? "Edge"
                : contextMenu.kind === "group"
                  ? "Group"
                  : contextMenu.kind === "selection"
                    ? "Selection"
                    : "Add node"
          }
          {...(contextMenu.kind === "launcher"
            ? {
                searchValue: nodeLauncherQuery,
                onSearchChange: setNodeLauncherQuery,
                searchPlaceholder: "Search node types…",
              }
            : {})}
          actions={
            contextMenu.kind === "node"
              ? [
                  { label: "Edit configuration", onClick: () => canvasActions.editNode(contextMenu.nodeId) },
                  { label: "Run from here", onClick: () => canvasActions.runFromNode(contextMenu.nodeId) },
                  { label: "Duplicate node", onClick: () => duplicateNode(contextMenu.nodeId) },
                  {
                    label: "Show upstream",
                    separatorBefore: true,
                    onClick: () => setDependencyView({ nodeId: contextMenu.nodeId, direction: "upstream" }),
                  },
                  { label: "Show downstream", onClick: () => setDependencyView({ nodeId: contextMenu.nodeId, direction: "downstream" }) },
                  { label: "Show all dependencies", onClick: () => setDependencyView({ nodeId: contextMenu.nodeId, direction: "both" }) },
                  ...groupMenuActionsForNode(contextMenu.nodeId),
                  { label: "Delete node", onClick: deleteSelection, tone: "destructive", separatorBefore: true },
                ]
              : contextMenu.kind === "edge"
                ? [{ label: "Delete edge", onClick: deleteSelection, tone: "destructive" }]
                : contextMenu.kind === "group"
                  ? groupMenuActions(contextMenu.groupId)
                  : contextMenu.kind === "selection"
                    ? [{ label: "Group selection", shortcut: "⌘G", onClick: () => groupNodes(selectedNodeIdsForGrouping()) }]
                    : NODE_TYPES_FOR_CONTEXT_MENU.filter(
                    (type) =>
                      contextMenu.kind !== "launcher" ||
                      NODE_TYPE_TAXONOMY[type].title.toLowerCase().includes(nodeLauncherQuery.toLowerCase()),
                  ).map((type) => ({
                    label: NODE_TYPE_TAXONOMY[type].title,
                    onClick: () => addNode(type, { x: contextMenu.flowX, y: contextMenu.flowY }),
                  }))
          }
        />
      )}

      {/* Bottom mobile action bar — the top HUD's buttons are reachable at
          compact widths too (it wraps), but a thumb-reachable bottom bar is
          the more usable mobile pattern for the most-used actions.
          Compact-only: at desktop widths these same actions already have
          dedicated HUD buttons plus hotkeys/palette entries. */}
      {workbench.isCompact && (
        // Mobile bottom tray (STO-607): the same MobileTabBar the studio
        // shell uses for its global tabs, with canvas actions instead. The
        // graph switcher lives in the header; the less frequent canvas
        // actions sit behind More.
        <MobileTabBar
          aria-label="Graph actions"
          tabs={[
            { id: "graphs", label: "Graphs", icon: <Workflow />, href: "/graphs" },
            {
              id: "add",
              label: "Add",
              icon: <Plus />,
              active: workbench.activePanel === "palette",
              onClick: () => workbench.toggle("palette"),
            },
            {
              id: "run",
              label: "Run",
              icon: <Play />,
              active: workbench.activePanel === "run",
              onClick: () => workbench.toggle("run"),
            },
            {
              id: "chat",
              label: "Chat",
              icon: <Sparkles />,
              active: workbench.activePanel === "chat",
              onClick: () => workbench.open("chat"),
            },
            {
              id: "more",
              label: "More",
              icon: <MoreHorizontal />,
              hasPopup: "menu",
              active: trayMenuAnchor !== null,
              onClick: (event) => setTrayMenuAnchor(menuAnchorFor(event.currentTarget, "right", 240)),
            },
          ]}
        />
      )}
      {trayMenuAnchor && (
        <NodeContextMenu
          x={trayMenuAnchor.x}
          y={trayMenuAnchor.y}
          width={240}
          title="Canvas"
          // Open above the tray; +48 also covers the title row the menu's height estimate leaves out.
          bottomReserve={MOBILE_TAB_BAR_HEIGHT + 48}
          onClose={() => setTrayMenuAnchor(null)}
          actions={[
            { label: "Focus mode", icon: <Focus size={14} />, checked: focusMode, onClick: () => setFocusMode((value) => !value) },
            { label: "Workflow summary", icon: <ListChecks size={14} />, onClick: () => setMobileSummaryExpanded(true) },
            {
              label: "Releases",
              icon: <Tag size={14} />,
              checked: workbench.activePanel === "releases",
              separatorBefore: true,
              onClick: () => workbench.toggle("releases"),
            },
            {
              label: "Routing lab",
              icon: <FlaskConical size={14} />,
              checked: workbench.activePanel === "routingLab",
              onClick: () => workbench.toggle("routingLab"),
            },
            {
              label: "Knowledge",
              icon: <BookOpen size={14} />,
              checked: workbench.activePanel === "knowledge",
              onClick: () => workbench.toggle("knowledge"),
            },
            {
              label: "Policies",
              icon: <ShieldCheck size={14} />,
              checked: workbench.activePanel === "policies",
              onClick: () => workbench.toggle("policies"),
            },
            {
              label: "Find on canvas",
              icon: <Search size={14} />,
              separatorBefore: true,
              onClick: () => setFindOpen(true),
            },
            {
              label: health ? `Health · ${health.score}` : "Health",
              icon: <Activity size={14} />,
              checked: workbench.activePanel === "health",
              onClick: () => workbench.toggle("health"),
            },
            {
              label: "Shortcuts and gestures",
              icon: <HelpCircle size={14} />,
              separatorBefore: true,
              onClick: () => workbench.toggle("help"),
            },
          ]}
        />
      )}
      </div>

      {/* Right reserved column — the run panel, the releases panel, and the
          selection dock (node/edge inspector, or the workflow summary when
          nothing is selected) share this slot (already mutually exclusive
          via `showSelectionDock`'s `workbench.activePanel` checks), so at
          most one ever occupies this column's width at a time. */}
      <WorkbenchDrawer panelId="run" side="right" mode="docked-reserve" dockedClassName="w-96 border-l overflow-y-auto">
        <RunPanel
          layout="rail"
          graphId={graphId}
          inputVariables={runInputVariables(nodes)}
          diagnostics={diagnostics}
          diagnosticsSectionRef={diagnosticsSectionRef}
          providerBlockMessage={providerBlockMessage}
          inspectionRunId={inspectionRunId}
          onExitInspection={exitInspection}
          onCompile={handleCompile}
          onRun={handleRun}
          onRunFromNode={handleRunFromNode}
          onValidate={refreshDiagnostics}
          onDiagnosticClick={handleDiagnosticClick}
          onPolicyExceptionCreated={refreshDiagnostics}
      getGraph={buildGraphDefinition}
          runSummary={runSummary}
          runHistory={runHistory}
          runHistoryLoading={runHistoryLoading}
          compiling={compiling}
          onSelectRun={(runId) => void handleSelectHistoricalRun(runId)}
          events={events}
          selectedTrace={selectedTrace}
          selectedNodeId={selectedNodeId}
          nodeTraces={nodeTraces}
          onFocusNode={handleWaterfallFocusNode}
          sectionRequest={runSectionRequest}
          runFromNodeRequest={runFromNodeRequest}
          onRunFromNodeRequestHandled={() => setRunFromNodeRequest(null)}
          onCaptureDataset={setCaptureRuns}
          reducedMotion={workbench.reducedMotion}
          inspectLoadError={inspectLoadError}
          onRetryInspect={() => {
            const runId = lastInspectAttemptRef.current ?? inspectionRunId;
            if (runId) void handleSelectHistoricalRun(runId);
          }}
        />
      </WorkbenchDrawer>
      <WorkbenchDrawer panelId="releases" side="right" mode="docked-reserve" dockedClassName="w-96 border-l overflow-y-auto">
        <ReleasesPanel layout="rail" graphId={graphId} diagnostics={diagnostics} dirty={dirty} getDraftGraph={buildGraphDefinition} />
      </WorkbenchDrawer>
      <WorkbenchDrawer panelId="routingLab" side="right" mode="docked-reserve" dockedClassName="w-96 border-l overflow-y-auto">
        <RoutingLabPanel layout="rail" graphId={graphId} />
      </WorkbenchDrawer>
      <WorkbenchDrawer panelId="knowledge" side="right" mode="docked-reserve" dockedClassName="w-96 border-l overflow-y-auto">
        <KnowledgePanel layout="rail" graphId={graphId} />
      </WorkbenchDrawer>
      <WorkbenchDrawer panelId="policies" side="right" mode="docked-reserve" dockedClassName="w-96 border-l overflow-y-auto">
        <PolicyPanel layout="rail" graphId={graphId} onPoliciesChanged={refreshDiagnostics} />
      </WorkbenchDrawer>
      <WorkbenchDrawer panelId="health" side="right" mode="docked-reserve" dockedClassName="w-96 border-l overflow-y-auto">
        <HealthPanel
          layout="rail"
          health={health}
          loading={healthLoading}
          error={healthError}
          onRefresh={refreshHealth}
          onFocusNode={(nodeId) => focusNode(nodeId)}
        />
      </WorkbenchDrawer>
      {showSelectionDock && !workbench.isCompact && (
        <div className="glass-panel ghost-border h-full min-h-0 w-96 shrink-0 overflow-y-auto border-l">
          {selectionDockContent}
        </div>
      )}
      {showSelectionDock && workbench.isCompact && (hasSelection || mobileSummaryExpanded) && (
        <>
          {/* Full-viewport backdrop -- without this the dock behind it (the
              graph canvas, the graph switcher's own drawer) stayed visible
              and tappable around the dock's edges, which read as a broken
              overlay rather than a deliberate one. Tapping it deselects
              (matching onPaneClick's canvas-tap-to-deselect behavior) and
              collapses the workflow summary back to its strip. */}
          <div
            className="fixed inset-0 z-20 bg-black/45"
            onClick={() => {
              setPendingConnection(null);
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              setMobileSummaryExpanded(false);
            }}
          />
          <div
            className="glass-panel ghost-border fixed inset-x-4 z-20 flex flex-col overflow-y-auto rounded-2xl border"
            style={{ top: compactDockTop, maxHeight: `calc(100vh - ${compactDockTop}px - ${COMPACT_DOCK_BOTTOM_RESERVE_PX}px)` }}
          >
            {/* Always rendered now -- it used to be gated on `hasSelection`,
                which meant the workflow-summary case (the default state on
                every compact page load) had no way to dismiss the sheet at
                all short of the backdrop tap above, which the sheet itself
                mostly covered on shorter phones. */}
            <div className="flex justify-end p-2 pb-0">
              <IconButton
                size="touch"
                label="Close"
                icon={<X size={18} />}
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  setMobileSummaryExpanded(false);
                }}
              />
            </div>
            <div className="pb-[env(safe-area-inset-bottom)]">{selectionDockContent}</div>
          </div>
        </>
      )}
      {showSelectionDock && workbench.isCompact && !hasSelection && !mobileSummaryExpanded && (
        // Collapsed default state: a small tappable strip instead of the
        // full workflow-summary sheet, so nothing covers the canvas until
        // the user asks for it. Doubles as a live-glance status readout.
        <button
          type="button"
          className="glass-panel ghost-border fixed inset-x-4 z-20 flex items-center justify-between rounded-2xl border px-4 py-3 text-left"
          style={{ top: compactDockTop }}
          onClick={() => setMobileSummaryExpanded(true)}
          aria-label="Show workflow summary"
        >
          <span className="text-sm font-medium">
            {nodes.length} node{nodes.length === 1 ? "" : "s"} · {edges.length} edge{edges.length === 1 ? "" : "s"}
          </span>
          <span className={cn("text-xs", validationLabel === "Ready" ? "text-emerald-400" : "text-amber-400")}>
            {validationLabel}
          </span>
        </button>
      )}
      {graphId && (
        <CaptureDatasetDialog
          open={captureRuns !== null}
          onOpenChange={(open) => {
            if (!open) setCaptureRuns(null);
          }}
          graphId={graphId}
          runs={captureRuns ?? []}
        />
      )}
    </div>
    </ResourceNamesProvider>
  );
}

const dependencyChipStyle: CSSProperties = {
  pointerEvents: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 6px 4px 12px",
  borderRadius: 999,
  fontSize: 12,
  color: "#e8eaed",
  border: "1px solid rgba(143, 186, 255, 0.45)",
};

const dependencyChipButtonStyle: CSSProperties = {
  background: "rgba(143, 186, 255, 0.15)",
  color: "#8fbaff",
  border: "none",
  borderRadius: 999,
  padding: "2px 10px",
  fontSize: 12,
  cursor: "pointer",
};
