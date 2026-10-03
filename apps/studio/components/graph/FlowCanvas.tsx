import { useLongPress } from "@/hooks/useLongPress";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ViewportPortal,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
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
import { minimapLayout } from "@/lib/canvasLayout";
import { DEFAULT_GRID, snapToGrid as roundToGrid, snapToGuides, type Box, type Guide } from "@/lib/canvasAlign";
import { NODE_CARD_MAX_HEIGHT, NODE_CARD_WIDTH } from "@/layout/nodeGeometry";
import { flowInteraction, zoomAround, type CanvasTool } from "@/lib/canvasTools";
import { PALETTE_DRAG_TYPE, type PaletteDrop } from "./paletteSections";
import { canvas, color, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
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
  /** Compact/mobile: drop the zoom Controls, which otherwise sit under
   * GraphEditor's bottom action bar (pinch-zoom covers zooming). */
  compact?: boolean;
  /** Snap to the grid and to smart guides while dragging (the status bar's Snap toggle). */
  snapToGrid?: boolean;
  /** The grid's step in flow pixels (12, 24 or 48). */
  gridSize?: number;
  /** The active pointer tool (§4) and whether Space is held (a temporary Hand). */
  tool?: CanvasTool;
  spaceHeld?: boolean;
  /** A palette item dropped on the canvas, at its flow-space point. */
  onDropItem?: (item: PaletteDrop, flowPosition: { x: number; y: number }) => void;
  /** Rendered below the pane, inside the ReactFlowProvider (the status bar). */
  footer?: ReactNode;
  /** Pixels of the pane covered by floating chrome (the graph header on
   * top; the mobile action bar at the bottom). Fit-to-view keeps the graph
   * clear of them instead of centering it underneath. */
  fitInsets?: { top: number; bottom: number; /** The tool bar's strip on the left. */ left?: number };
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
  focusRequest = null,
  spacing = "standard",
  showMinimap = true,
  fitViewNonce = 0,
  viewportCenterRef,
  compact = false,
  snapToGrid = true,
  gridSize = DEFAULT_GRID,
  tool = "select",
  spaceHeld = false,
  onDropItem,
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
  // Focus requests can target derived nodes too (sticky notes, frames).
  const renderNodesRef = useRef(renderNodes);
  renderNodesRef.current = renderNodes;
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
  const insetLeft = fitInsets?.left;
  const fitPadding = useMemo(
    () =>
      insetTop === undefined || insetBottom === undefined
        ? FIT_VIEW_PADDING
        : insetLeft
          ? { top: `${insetTop}px` as const, bottom: `${insetBottom}px` as const, left: `${insetLeft}px` as const, right: "6%" as const }
          : { top: `${insetTop}px` as const, bottom: `${insetBottom}px` as const, x: "6%" as const },
    [insetTop, insetBottom, insetLeft],
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
    const targetNodes = (renderNodesRef.current ?? nodesRef.current).filter((candidate) => targetIds.has(candidate.id));
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
        // Auto-layout lands on the grid too (§9).
        position: snapToGrid ? roundToGrid(node.position, gridSize) : node.position,
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

  const MIN_ZOOM = 0.15;
  const MAX_ZOOM = 2;
  const zoomAtPointer = useCallback(
    (event: ReactMouseEvent) => {
      const bounds = paneRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const next = zoomAround(reactFlow.getViewport(), point, event.altKey ? 1 / 1.5 : 1.5, { min: MIN_ZOOM, max: MAX_ZOOM });
      void reactFlow.setViewport(next, { duration: reducedMotion ? 0 : 160 });
    },
    [reactFlow, reducedMotion],
  );

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      if (tool === "zoom" && !spaceHeld) {
        zoomAtPointer(event);
        return;
      }
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
    [onPaneClick, onPaneDoubleClick, reactFlow, spaceHeld, tool, zoomAtPointer],
  );
  const interaction = flowInteraction(tool, spaceHeld);

  // Smart guides (§9): while one node is dragged, it snaps to the nearest
  // edge or center of another node within a few pixels, ahead of the grid.
  // Holding Shift or Alt drags freely, grid included.
  const [guides, setGuides] = useState<Guide[]>([]);
  const [freeDrag, setFreeDrag] = useState(false);
  useEffect(() => {
    const update = (event: KeyboardEvent) => setFreeDrag(event.shiftKey || event.altKey);
    const reset = () => setFreeDrag(false);
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", reset);
    };
  }, []);
  const boxOf = useCallback(
    (node: Node): Box => {
      const measured = reactFlow.getInternalNode(node.id)?.measured;
      return {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: measured?.width ?? NODE_CARD_WIDTH,
        height: measured?.height ?? NODE_CARD_MAX_HEIGHT,
      };
    },
    [reactFlow],
  );
  // Grid snapping happens here, not in React Flow, so a guide can win over
  // the grid on its axis: React Flow would round to the grid first, which
  // can leave an off-grid neighbor's edge out of reach.
  // The drag-end change carries React Flow's raw position; it keeps the
  // last snapped one instead.
  const lastSnapRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const handleNodesChange = useCallback(
    (incoming: NodeChange<Node<GraphNodeData>>[]) => {
      const changes = incoming.map((change) => {
        if (change.type !== "position" || change.dragging || !change.position) return change;
        const snapped = lastSnapRef.current.get(change.id);
        if (!snapped) return change;
        lastSnapRef.current.delete(change.id);
        return { ...change, position: snapped };
      });
      const drags = changes.filter((change) => change.type === "position" && change.dragging && change.position);
      if (drags.length !== 1 || !snapToGrid || freeDrag) {
        if (guides.length > 0 && changes.some((change) => change.type === "position")) setGuides([]);
        const snapping = snapToGrid && !freeDrag;
        if (!snapping) for (const change of drags) if ("id" in change) lastSnapRef.current.delete(change.id);
        onNodesChange(
          snapping
            ? changes.map((change) => {
                if (change.type !== "position" || !change.dragging || !change.position) return change;
                const position = roundToGrid(change.position, gridSize);
                lastSnapRef.current.set(change.id, position);
                return { ...change, position };
              })
            : changes,
        );
        return;
      }
      const drag = drags[0] as Extract<NodeChange<Node<GraphNodeData>>, { type: "position" }>;
      const current = reactFlow.getNode(drag.id);
      // Group frames move their members; they don't snap themselves.
      if (!current || !drag.position || current.type === "groupFrame" || current.type === "laneBand") {
        onNodesChange(changes);
        return;
      }
      const moving = boxOf({ ...current, position: drag.position });
      // Only nearby nodes: a guide off-screen is no use and costs a scan.
      const reach = 800;
      const others = reactFlow
        .getNodes()
        .filter(
          (node) =>
            node.id !== drag.id &&
            !node.hidden &&
            node.type !== "groupFrame" &&
            node.type !== "laneBand" &&
            Math.abs(node.position.x - drag.position!.x) < reach &&
            Math.abs(node.position.y - drag.position!.y) < reach,
        )
        .map(boxOf);
      const snapped = snapToGuides(moving, others);
      const onGrid = roundToGrid(drag.position, gridSize);
      const position = {
        x: snapped.guides.some((guide) => guide.orientation === "vertical") ? snapped.position.x : onGrid.x,
        y: snapped.guides.some((guide) => guide.orientation === "horizontal") ? snapped.position.y : onGrid.y,
      };
      setGuides(snapped.guides);
      lastSnapRef.current.set(drag.id, position);
      onNodesChange(changes.map((change) => (change === drag ? { ...drag, position } : change)));
    },
    [boxOf, freeDrag, gridSize, guides.length, onNodesChange, reactFlow, snapToGrid],
  );

  // Touch has no right-click: a long press opens the same menus.
  const longPress = useLongPress((target, x, y) => {
    const node = target.closest(".react-flow__node[data-id]");
    if (node) return onNodeContextMenu?.(node.getAttribute("data-id")!, x, y);
    const edge = target.closest(".react-flow__edge[data-id]");
    if (edge) return onEdgeContextMenu?.(edge.getAttribute("data-id")!, x, y);
    if (target.closest(".react-flow__nodesselection")) return onSelectionContextMenu?.(x, y);
    if (!target.closest(".react-flow__pane")) return;
    const flowPosition = reactFlow.screenToFlowPosition({ x, y });
    onPaneContextMenu?.(x, y, flowPosition.x, flowPosition.y);
  });

  return (
    <div
      ref={paneRef}
      data-canvas-tool={spaceHeld ? "hand" : tool}
      style={{ position: "absolute", inset: 0 }}
      {...longPress}
      onDragOver={(event) => {
        if (!onDropItem || !event.dataTransfer.types.includes(PALETTE_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData(PALETTE_DRAG_TYPE);
        if (!onDropItem || !raw) return;
        event.preventDefault();
        try {
          const item = JSON.parse(raw) as PaletteDrop;
          onDropItem(item, reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        } catch {
          // Not a palette payload.
        }
      }}
    >
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
        onNodesChange={handleNodesChange}
        onNodeDragStop={() => setGuides([])}
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
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        panOnDrag={interaction.panOnDrag}
        selectionOnDrag={interaction.selectionOnDrag}
        selectionMode={SelectionMode.Partial}
        nodesDraggable={interaction.nodesDraggable}
        // Snapping (grid and guides) is applied in handleNodesChange.
        snapToGrid={false}
        defaultEdgeOptions={{ interactionWidth: 24 }}
        nodesConnectable
        nodeTypes={nodeTypes}
        edgeTypes={EDGE_TYPES}
        onNodeClick={(event, node) => {
          if (tool === "zoom" && !spaceHeld) {
            zoomAtPointer(event);
            return;
          }
          onNodeClick(node.id);
        }}
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
        <Background id="minor" variant={BackgroundVariant.Lines} gap={gridSize} size={1} color={canvas.grid} />
        <Background id="major" variant={BackgroundVariant.Lines} gap={gridSize * 5} size={1} color={canvas.gridMajor} />
        {guides.length > 0 && <SnapGuides guides={guides} />}
        {!compact && <Controls />}
        {showMinimap && <CanvasMinimap paneWidth={paneSize.width} />}
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

/** Smart-guide lines in flow coordinates, kept 1 screen pixel wide at any zoom. */
function SnapGuides({ guides }: { guides: Guide[] }) {
  const zoom = useStore((state) => state.transform[2]);
  const thickness = 1 / zoom;
  return (
    <ViewportPortal>
      {guides.map((guide) => (
        <div
          key={`${guide.orientation}:${guide.at}`}
          data-testid="snap-guide"
          aria-hidden="true"
          style={{
            position: "absolute",
            pointerEvents: "none",
            background: color.primary[500],
            zIndex: 1000,
            ...(guide.orientation === "vertical"
              ? { left: guide.at - thickness / 2, top: guide.from - 8, width: thickness, height: guide.to - guide.from + 16 }
              : { top: guide.at - thickness / 2, left: guide.from - 8, height: thickness, width: guide.to - guide.from + 16 }),
          }}
        />
      ))}
    </ViewportPortal>
  );
}

/**
 * The minimap, sized by the pane (canvas-workbench-ergonomics-plan.md §2):
 * 200×150, 160×110, or a "Map" button below 700px that opens it at 160×110.
 */
function CanvasMinimap({ paneWidth }: { paneWidth: number }) {
  const [expanded, setExpanded] = useState(false);
  const layout = minimapLayout(paneWidth);
  const collapsed = layout.mode === "collapsed";
  const size = layout.mode === "collapsed" ? { width: 160, height: 110 } : layout;
  return (
    <>
      {(!collapsed || expanded) && (
        <MiniMap
          ariaLabel="Minimap"
          nodeStrokeWidth={2}
          maskColor="rgba(13, 21, 32, 0.75)"
          pannable
          zoomable
          style={{ width: size.width, height: size.height, ...(collapsed ? { marginBottom: 52 } : {}) }}
        />
      )}
      {collapsed && (
        <Panel position="bottom-right">
          <button
            type="button"
            className="agb-focus-ring agb-hoverable"
            aria-expanded={expanded}
            aria-label={expanded ? "Hide minimap" : "Show minimap"}
            onClick={() => setExpanded((value) => !value)}
            style={mapButtonStyle(expanded)}
          >
            Map
          </button>
        </Panel>
      )}
    </>
  );
}

function mapButtonStyle(expanded: boolean): CSSProperties {
  return {
    height: 32,
    padding: `0 ${spacing[2]}px`,
    borderRadius: radius.lg,
    border: `1px solid ${expanded ? surface.borderStrong : surface.border}`,
    background: expanded ? surface.raised : surface.panel,
    color: expanded ? color.primary[500] : text.primary,
    cursor: "pointer",
    ...typeScale.caption,
  };
}

export function FlowCanvas({ footer, ...props }: FlowCanvasProps) {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0 }}>
      <ReactFlowProvider>
        <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0 }}>
          <FlowCanvasInner {...props} />
        </div>
        {footer}
      </ReactFlowProvider>
    </div>
  );
}
