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
import { useCallback, useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useCanvasOrientation } from "../hooks/useCanvasOrientation";
import { layoutNodesWithDagre } from "../layout/dagreLayout";
import type { GraphNodeData } from "./nodes/GraphNodeView";
import type { GraphOrientation } from "../types";
import { shell } from "../theme";

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
  nodesRef.current = nodes;
  edgesRef.current = edges;
  const { effectiveRankDir, liveAnnouncement: orientationAnnouncement, clearLiveAnnouncement } = useCanvasOrientation(
    paneRef,
    graphOrientation,
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

    window.requestAnimationFrame(() => {
      if (layoutRequestRef.current !== requestId) return;
      reactFlow.fitView({ padding: 0.18, duration: reducedMotion ? 0 : shell.motion.drawerMs });
    });
  }, [effectiveRankDir, graphId, reducedMotion, reactFlow, setNodes]);

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
      {overlay}
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      <ReactFlowProvider>
        <FlowCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
