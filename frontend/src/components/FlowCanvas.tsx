import {
  Background,
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
import { useCallback, useEffect, useRef, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useCanvasOrientation } from "../hooks/useCanvasOrientation";
import { layoutNodesWithDagre } from "../layout/dagreLayout";
import type { GraphNodeData } from "./nodes/GraphNodeView";
import type { GraphOrientation } from "../types";
import { color, radius, shell, spacing, surface, text, typeScale } from "../theme";
import { Button } from "./ui/Button";

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
  authoringEnabled: boolean;
  nodeTypes: NodeTypes;
  reducedMotion: boolean;
  graphOrientation: GraphOrientation;
  onNodeClick: (nodeId: string) => void;
  onEdgeClick: (edgeId: string) => void;
  onPaneClick: () => void;
  liveAnnouncement: string;
  onLiveAnnouncement: (message: string) => void;
  onClearLiveAnnouncement: () => void;
};

function canFitView(width: number, height: number): boolean {
  return width > 0 && height > 0;
}

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
  authoringEnabled,
  nodeTypes,
  reducedMotion,
  graphOrientation,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
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
  nodesRef.current = nodes;
  edgesRef.current = edges;
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

  useEffect(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    if (!graphId || currentNodes.length === 0) return;

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
  }, [effectiveRankDir, graphId, nodes.length, edges.length, reducedMotion, runFitView, setNodes]);

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
        style={{ width: "100%", height: "100%" }}
        nodes={nodes}
        edges={edges}
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
        nodesConnectable={authoringEnabled}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        onEdgeClick={(_, edge) => onEdgeClick(edge.id)}
        onPaneClick={handlePaneClick}
        colorMode="dark"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
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
