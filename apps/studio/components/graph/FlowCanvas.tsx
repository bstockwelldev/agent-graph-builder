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
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useCanvasOrientation } from "@/hooks/useCanvasOrientation";
import { layoutNodesWithDagre } from "@/layout/dagreLayout";
import { applyEdgePointerAffordance } from "@/lib/diagnostics";
import { shouldRunDagre } from "@/lib/graphAuthoring";
import type { GraphNodeData } from "./nodes/GraphNodeView";
import type { GraphOrientation } from "@bstockwelldev/agent-graph-sdk";
import { canFitView } from "@/lib/canvasFit";
import { canvas, color, radius, shell, spacing, surface, text, typeScale } from "@/lib/graph-theme";
import { Button } from "./ui/Button";
import { CanvasEdgeLegend } from "./CanvasEdgeLegend";

const FIT_VIEW_PADDING = 0.18;
const FIT_VIEW_DEBOUNCE_MS = 150;

type FlowCanvasProps = {
  graphId: string | null;
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
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
  onNodeContextMenu?: (nodeId: string, x: number, y: number) => void;
  onEdgeContextMenu?: (edgeId: string, x: number, y: number) => void;
  onPaneContextMenu?: (x: number, y: number, flowX: number, flowY: number) => void;
  liveAnnouncement: string;
  onLiveAnnouncement: (message: string) => void;
  onClearLiveAnnouncement: () => void;
};

function FlowCanvasInner({
  graphId,
  nodes,
  edges,
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
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneContextMenu,
  liveAnnouncement,
  onLiveAnnouncement,
  onClearLiveAnnouncement,
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
      edges.map((edge) => ({
        ...edge,
        style: applyEdgePointerAffordance(edge.style, edge.id === hoveredEdgeId || edge.id === selectedEdgeId),
      })),
    [edges, hoveredEdgeId, selectedEdgeId],
  );
  const {
    effectiveRankDir,
    paneSize,
    liveAnnouncement: orientationAnnouncement,
    clearLiveAnnouncement,
  } = useCanvasOrientation(paneRef, graphOrientation);

  const runFitView = useCallback(
    (requestId: number) => {
      if (!canFitView(paneSize.width, paneSize.height)) return;
      window.requestAnimationFrame(() => {
        if (layoutRequestRef.current !== requestId) return;
        window.requestAnimationFrame(() => {
          if (layoutRequestRef.current !== requestId) return;
          reactFlow.fitView({
            padding: FIT_VIEW_PADDING,
            duration: reducedMotion ? 0 : shell.motion.drawerMs,
          });
        });
      });
    },
    [paneSize.height, paneSize.width, reactFlow, reducedMotion],
  );

  useEffect(() => {
    if (orientationAnnouncement) {
      onLiveAnnouncement(orientationAnnouncement);
      clearLiveAnnouncement();
    }
  }, [orientationAnnouncement, clearLiveAnnouncement, onLiveAnnouncement]);

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

    if (
      !shouldRunDagre({
        rankDirChanged,
        graphIdChanged,
        relayoutRequested,
        topologyChanged: false,
      })
    ) {
      return;
    }

    const requestId = layoutRequestRef.current + 1;
    layoutRequestRef.current = requestId;

    const laidOut = layoutNodesWithDagre(currentNodes, currentEdges, effectiveRankDir);
    const transition = reducedMotion ? undefined : `transform ${shell.motion.drawerMs}ms ease`;

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
  }, [effectiveRankDir, graphId, hasNodes, relayoutNonce, reducedMotion, runFitView, setNodes]);

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

  const handlePaneClick = useCallback(() => {
    onPaneClick();
  }, [onPaneClick]);

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
        nodes={nodes}
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
        snapToGrid={authoringEnabled}
        snapGrid={[24, 24]}
        defaultEdgeOptions={{ interactionWidth: 24 }}
        nodesConnectable={authoringEnabled}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeClick(node.id)}
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
        <Controls />
        <MiniMap nodeStrokeWidth={2} maskColor="rgba(13, 21, 32, 0.75)" />
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
      <CanvasEdgeLegend visible={Boolean(graphId) && !graphLoading && !noGraphSelected} />
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
