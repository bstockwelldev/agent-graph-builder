import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useCanvasOrientation } from "@/hooks/useCanvasOrientation";
import { handlesForRankDir, layoutNodesWithDagre, needsInitialLayout, type LayoutSpacing } from "@/layout/dagreLayout";
import { applyEdgePointerAffordance } from "@/lib/diagnostics";
import { shouldRunDagre } from "@/lib/graphAuthoring";
import type { GraphNodeData } from "./nodes/GraphNodeView";
import type { GraphOrientation } from "@bstockwelldev/agent-graph-sdk";
import { canFitView } from "@/lib/canvasFit";
import { canvas, color, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { CanvasEdgeLegend } from "./CanvasEdgeLegend";
import { LabeledEdge } from "./edges/LabeledEdge";

// Studio-graph-workbench-redesign-plan.md, Slice 6: every edge renders
// through LabeledEdge (chip labels, run-state styling) -- registered as the
// "default" type so edges built without an explicit `type` pick it up.
const EDGE_TYPES: EdgeTypes = { default: LabeledEdge };

const FIT_VIEW_PADDING = 0.18;
const FIT_VIEW_DEBOUNCE_MS = 150;
/** Diagnostics-as-navigation (studio-ux-gap-remediation-plan.md §1): a
 * focus request fits a single node/edge closer and more zoomed-in than the
 * whole-graph FIT_VIEW_PADDING above, so the target is unambiguous. */
const FOCUS_FIT_PADDING = 0.6;
const FOCUS_FIT_MAX_ZOOM = 1.2;

type FlowCanvasProps = {
  graphId: string | null;
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  /** Wave 7b: what React Flow actually draws when it differs from the
   * graph -- group frames added, collapsed members hidden, crossing edges
   * rerouted. Layout, fit and focus keep working from `nodes`/`edges`. */
  renderNodes?: Node<GraphNodeData>[];
  renderEdges?: Edge[];
  onSelectionContextMenu?: (x: number, y: number) => void;
  setNodes: Dispatch<SetStateAction<Node<GraphNodeData>[]>>;
  onNodesChange: OnNodesChange<Node<GraphNodeData>>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: ((connection: Connection) => void) | undefined;
  onConnectStart?: (event: MouseEvent | TouchEvent) => void;
  overlay?: ReactNode;
  loadFailureVisible?: boolean;
  onRetryLoad?: () => void;
  graphLoading?: boolean;
  noGraphSelected?: boolean;
  authoringEnabled: boolean;
  nodeTypes: NodeTypes;
  reducedMotion: boolean;
  graphOrientation: GraphOrientation;
  relayoutNonce?: number;
  selectedEdgeId?: string | null;
  onNodeClick: (nodeId: string) => void;
  onEdgeClick: (edgeId: string) => void;
  onPaneClick: () => void;
  /** Phase 10 Slice C follow-up, "double-click + searchable node
   * launcher" — React Flow has no built-in pane-double-click event
   * (only onNodeDoubleClick, already used to zoom into a node), so
   * FlowCanvasInner detects it manually from consecutive onPaneClick
   * calls. */
  onPaneDoubleClick?: (x: number, y: number, flowX: number, flowY: number) => void;
  onNodeContextMenu?: (nodeId: string, x: number, y: number) => void;
  onEdgeContextMenu?: (edgeId: string, x: number, y: number) => void;
  onPaneContextMenu?: (x: number, y: number, flowX: number, flowY: number) => void;
  liveAnnouncement: string;
  onLiveAnnouncement: (message: string) => void;
  onClearLiveAnnouncement: () => void;
  /** Diagnostics-as-navigation (studio-ux-gap-remediation-plan.md §1):
   * bump `nonce` to pan/zoom the canvas onto a node or edge (e.g. from a
   * diagnostic click), independent of the normal fit-view-on-load/relayout
   * behavior above. `nodeId`/`edgeId` are looked up in the current
   * nodes/edges at the moment `nonce` changes. */
  focusRequest?: { nodeId?: string | null; edgeId?: string | null; nonce: number } | null;
  /** Layout menu (studio-graph-workbench-redesign-plan.md, Slice 3). */
  spacing?: LayoutSpacing;
  showMinimap?: boolean;
  /** Bump to fit the whole graph into view (Layout menu → Fit view). */
  fitViewNonce?: number;
  /** Filled with a function returning the flow-space point at the center
   * of the visible pane -- GraphEditor places new nodes there (Slice 5). */
  viewportCenterRef?: MutableRefObject<(() => { x: number; y: number }) | null>;
  /** Compact/mobile: drop the zoom Controls and edge legend, which
   * otherwise sit under GraphEditor's bottom action bar (pinch-zoom covers
   * zooming, and edge chips now label conditional/fallback edges). */
  compact?: boolean;
  /** Pixels of the pane covered by floating chrome (the graph header on
   * top; the mobile action bar at the bottom). Fit-to-view keeps the graph
   * clear of them instead of centering it underneath. */
  fitInsets?: { top: number; bottom: number };
};

function FlowCanvasInner({
  graphId,
  nodes,
  edges,
  renderNodes,
  renderEdges,
  onSelectionContextMenu,
  setNodes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onConnectStart,
  overlay,
  loadFailureVisible = false,
  onRetryLoad,
  graphLoading = false,
  noGraphSelected = false,
  authoringEnabled,
  nodeTypes,
  reducedMotion,
  graphOrientation,
  relayoutNonce = 0,
  selectedEdgeId = null,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  onPaneDoubleClick,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneContextMenu,
  liveAnnouncement,
  onLiveAnnouncement,
  onClearLiveAnnouncement,
  focusRequest = null,
  spacing = "standard",
  showMinimap = true,
  fitViewNonce = 0,
  viewportCenterRef,
  compact = false,
  fitInsets,
}: FlowCanvasProps) {
  const reactFlow = useReactFlow();
  const paneRef = useRef<HTMLDivElement>(null);
  const layoutRequestRef = useRef(0);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const fitViewDebounceRef = useRef<number | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const displayEdges = useMemo(
    () =>
      (renderEdges ?? edges).map((edge) => ({
        ...edge,
        style: applyEdgePointerAffordance(edge.style, edge.id === hoveredEdgeId || edge.id === selectedEdgeId),
      })),
    [edges, renderEdges, hoveredEdgeId, selectedEdgeId],
  );
  const {
    effectiveRankDir,
    paneSize,
    liveAnnouncement: orientationAnnouncement,
    clearLiveAnnouncement,
  } = useCanvasOrientation(paneRef, graphOrientation);

  const insetTop = fitInsets?.top;
  const insetBottom = fitInsets?.bottom;
  const fitPadding = useMemo(
    () =>
      insetTop === undefined || insetBottom === undefined
        ? FIT_VIEW_PADDING
        : { top: `${insetTop}px` as const, bottom: `${insetBottom}px` as const, x: "6%" as const },
    [insetTop, insetBottom],
  );

  const runFitView = useCallback(
    (requestId: number) => {
      if (!canFitView(paneSize.width, paneSize.height)) return;
      window.requestAnimationFrame(() => {
        if (layoutRequestRef.current !== requestId) return;
        window.requestAnimationFrame(() => {
          if (layoutRequestRef.current !== requestId) return;
          reactFlow.fitView({
            padding: fitPadding,
            duration: reducedMotion ? 0 : shell.motion.drawerMs,
          });
        });
      });
    },
    [fitPadding, paneSize.height, paneSize.width, reactFlow, reducedMotion],
  );

  useEffect(() => {
    if (orientationAnnouncement) {
      onLiveAnnouncement(orientationAnnouncement);
      clearLiveAnnouncement();
    }
  }, [orientationAnnouncement, clearLiveAnnouncement, onLiveAnnouncement]);

  // Diagnostics-as-navigation (studio-ux-gap-remediation-plan.md §1): pan/
  // zoom onto the diagnostic's node, or both endpoints of its edge, every
  // time `nonce` changes — including a repeat click on the same object,
  // which is why this keys off `nonce` rather than nodeId/edgeId identity.
  useEffect(() => {
    if (!focusRequest) return;
    const targetIds = new Set<string>();
    if (focusRequest.nodeId) targetIds.add(focusRequest.nodeId);
    if (focusRequest.edgeId) {
      const edge = edgesRef.current.find((candidate) => candidate.id === focusRequest.edgeId);
      if (edge) {
        targetIds.add(edge.source);
        targetIds.add(edge.target);
      }
    }
    const targetNodes = nodesRef.current.filter((candidate) => targetIds.has(candidate.id));
    if (targetNodes.length === 0) return;
    void reactFlow.fitView({
      nodes: targetNodes,
      padding: FOCUS_FIT_PADDING,
      maxZoom: FOCUS_FIT_MAX_ZOOM,
      duration: reducedMotion ? 0 : shell.motion.drawerMs,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per nonce; nodesRef/edgesRef read the latest state without retriggering on every node/edge identity change
  }, [focusRequest?.nonce]);

  const prevRankDirRef = useRef(effectiveRankDir);
  const prevGraphIdRef = useRef<string | null>(null);
  const prevRelayoutNonceRef = useRef(relayoutNonce);
  const hasNodes = nodes.length > 0;

  useEffect(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    if (!graphId || !hasNodes || currentNodes.length === 0) return;

    const rankDirChanged = prevRankDirRef.current !== effectiveRankDir;
    const graphIdChanged = prevGraphIdRef.current !== graphId;
    const relayoutRequested = prevRelayoutNonceRef.current !== relayoutNonce;
    prevRankDirRef.current = effectiveRankDir;
    prevGraphIdRef.current = graphId;
    prevRelayoutNonceRef.current = relayoutNonce;

    const initialLayoutNeeded = graphIdChanged ? needsInitialLayout(currentNodes, effectiveRankDir) : false;
    if (
      !shouldRunDagre({
        rankDirChanged,
        graphIdChanged,
        relayoutRequested,
        topologyChanged: false,
        initialLayoutNeeded,
      })
    ) {
      // A freshly opened graph with trustworthy saved positions keeps them
      // (Slice 5) -- but handle sides still have to follow the effective
      // direction, which only the dagre pass used to set.
      if (graphIdChanged) {
        const { source, target } = handlesForRankDir(effectiveRankDir);
        setNodes((current) => current.map((node) => ({ ...node, sourcePosition: source, targetPosition: target })));
      }
      return;
    }

    const requestId = layoutRequestRef.current + 1;
    layoutRequestRef.current = requestId;

    const laidOut = layoutNodesWithDagre(currentNodes, currentEdges, effectiveRankDir, spacing);
    const transition = reducedMotion ? undefined : `transform ${shell.motion.slow}ms ${shell.motion.easing}`;

    setNodes(
      laidOut.map((node) => ({
        ...node,
        style: {
          ...node.style,
          transition,
        },
      })),
    );

    runFitView(requestId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spacing is read at relayout time; changing it bumps relayoutNonce (GraphEditor), which is what triggers the pass
  }, [effectiveRankDir, graphId, hasNodes, relayoutNonce, reducedMotion, runFitView, setNodes]);

  const lastFitViewNonceRef = useRef(fitViewNonce);
  useEffect(() => {
    if (lastFitViewNonceRef.current === fitViewNonce) return;
    lastFitViewNonceRef.current = fitViewNonce;
    runFitView(layoutRequestRef.current);
  }, [fitViewNonce, runFitView]);

  useEffect(() => {
    if (!viewportCenterRef) return;
    viewportCenterRef.current = () => {
      const rect = paneRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 3 });
    };
    return () => {
      viewportCenterRef.current = null;
    };
  }, [reactFlow, viewportCenterRef]);

  useEffect(() => {
    if (!graphId || nodes.length === 0) return;
    if (!canFitView(paneSize.width, paneSize.height)) return;

    if (fitViewDebounceRef.current !== null) {
      window.clearTimeout(fitViewDebounceRef.current);
    }

    fitViewDebounceRef.current = window.setTimeout(() => {
      runFitView(layoutRequestRef.current);
    }, FIT_VIEW_DEBOUNCE_MS);

    return () => {
      if (fitViewDebounceRef.current !== null) {
        window.clearTimeout(fitViewDebounceRef.current);
      }
    };
  }, [graphId, nodes.length, paneSize.height, paneSize.width, runFitView]);

  // Phase 10 Slice C follow-up: manual double-click detection since
  // React Flow doesn't expose a pane-double-click event of its own.
  const lastPaneClickRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const DOUBLE_CLICK_WINDOW_MS = 400;
  const DOUBLE_CLICK_MAX_DRIFT_PX = 8;

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      const now = Date.now();
      const last = lastPaneClickRef.current;
      const isDoubleClick =
        last !== null &&
        now - last.time < DOUBLE_CLICK_WINDOW_MS &&
        Math.abs(event.clientX - last.x) < DOUBLE_CLICK_MAX_DRIFT_PX &&
        Math.abs(event.clientY - last.y) < DOUBLE_CLICK_MAX_DRIFT_PX;

      if (isDoubleClick && onPaneDoubleClick) {
        lastPaneClickRef.current = null;
        const flowPosition = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        onPaneDoubleClick(event.clientX, event.clientY, flowPosition.x, flowPosition.y);
        return;
      }

      lastPaneClickRef.current = { time: now, x: event.clientX, y: event.clientY };
      onPaneClick();
    },
    [onPaneClick, onPaneDoubleClick, reactFlow],
  );

  return (
    <div ref={paneRef} style={{ position: "absolute", inset: 0 }}>
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {liveAnnouncement}
      </div>
      <ReactFlow
        nodes={renderNodes ?? nodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={(event) => {
          if (event instanceof MouseEvent) {
            onConnectStart?.(event);
          } else if (event instanceof TouchEvent) {
            onConnectStart?.(event);
          }
        }}
        // React Flow's default minZoom (0.5) clamped fitView for graphs
        // wider than ~2x the pane (an 8-node chain), so "fit" left the ends
        // of the graph off-screen under the docked panels.
        minZoom={0.15}
        snapToGrid={authoringEnabled}
        snapGrid={[24, 24]}
        defaultEdgeOptions={{ interactionWidth: 24 }}
        nodesConnectable={authoringEnabled}
        nodeTypes={nodeTypes}
        edgeTypes={EDGE_TYPES}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        onNodeDoubleClick={(_, node) => {
          // Double-click/double-tap a node to zoom in on just it — the one
          // canvas gesture with no existing binding (tap selects, drag
          // pans, pinch/scroll zooms the whole graph already).
          void reactFlow.fitView({
            nodes: [{ id: node.id }],
            padding: FIT_VIEW_PADDING,
            duration: reducedMotion ? 0 : shell.motion.drawerMs,
          });
        }}
        onEdgeClick={(_, edge) => onEdgeClick(edge.id)}
        onEdgeMouseEnter={(_, edge) => {
          setHoveredEdgeId(edge.id);
        }}
        onEdgeMouseLeave={() => {
          setHoveredEdgeId(null);
        }}
        onPaneClick={handlePaneClick}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          onNodeContextMenu?.(node.id, event.clientX, event.clientY);
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          onEdgeContextMenu?.(edge.id, event.clientX, event.clientY);
        }}
        onSelectionContextMenu={(event) => {
          event.preventDefault();
          onSelectionContextMenu?.(event.clientX, event.clientY);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          const flowPosition = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          onPaneContextMenu?.(event.clientX, event.clientY, flowPosition.x, flowPosition.y);
        }}
        colorMode="dark"
        style={{ width: "100%", height: "100%", background: canvas.pane }}
      >
        <Background variant={BackgroundVariant.Lines} gap={24} size={1} color={canvas.grid} />
        <Background variant={BackgroundVariant.Lines} gap={120} size={1} color={canvas.gridMajor} />
        {!compact && <Controls />}
        {showMinimap && <MiniMap nodeStrokeWidth={2} maskColor="rgba(13, 21, 32, 0.75)" pannable zoomable />}
      </ReactFlow>
      {noGraphSelected && !graphLoading && (
        <div style={canvasEmptyStateStyle} role="status">
          <div style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[1] }}>No graph selected</div>
          <div style={{ ...typeScale.caption, opacity: 0.7, lineHeight: "18px" }}>
            Choose a graph from the library or create a new one to start editing.
          </div>
        </div>
      )}
      {graphLoading && (
        <div style={canvasEmptyStateStyle} role="status" aria-busy="true" aria-label="Loading graph">
          <div className="agb-skeleton" style={{ width: 180, height: 20, borderRadius: radius.lg, marginBottom: spacing[2] }} />
          <div className="agb-skeleton" style={{ width: 240, height: 14, borderRadius: radius.lg }} />
        </div>
      )}
      {loadFailureVisible && onRetryLoad && (
        <div style={loadFailureBannerStyle} role="alert">
          <div style={{ ...typeScale.small, fontWeight: 600, marginBottom: spacing[2] }}>Graph failed to load.</div>
          <Button variant="primary" onClick={onRetryLoad} style={{ minHeight: shell.touchTarget.min }}>
            Retry
          </Button>
        </div>
      )}
      {overlay}
      <CanvasEdgeLegend visible={Boolean(graphId) && !graphLoading && !noGraphSelected && !compact} />
    </div>
  );
}

const canvasEmptyStateStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: shell.zIndex.drawer - 1,
  padding: spacing[4],
  borderRadius: radius.lg,
  border: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
  textAlign: "center",
  maxWidth: 320,
  boxShadow: shell.shadow.drawer,
};

const loadFailureBannerStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: shell.zIndex.drawer,
  padding: spacing[3],
  borderRadius: radius.lg,
  border: `1px solid ${color.warning[700]}`,
  background: surface.panel,
  color: text.primary,
  textAlign: "center",
  boxShadow: shell.shadow.drawer,
};

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      <ReactFlowProvider>
        <FlowCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
