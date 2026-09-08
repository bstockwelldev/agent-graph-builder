import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, streamRunEvents } from "./api";
import { EdgeInspector, NodeInspector } from "./components/NodeInspector";
import { NodePalette } from "./components/NodePalette";
import { RunPanel } from "./components/RunPanel";
import { GraphNodeView, type GraphNodeData } from "./components/nodes/GraphNodeView";
import type { Diagnostic, EdgeKind, GraphDefinition, GraphEdge, GraphNode, NodeTrace, NodeType, PlatformEvent, RunSummary } from "./types";

const DEMO_GRAPH_ID = "demo_classify_and_route";

const nodeTypes = {
  input: GraphNodeView,
  prompt: GraphNodeView,
  llm: GraphNodeView,
  tool: GraphNodeView,
  router: GraphNodeView,
  output: GraphNodeView,
};

function defaultConfig(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "input":
      return { variableName: "question" };
    case "prompt":
      return { template: "{question}" };
    case "llm":
      return { model: "qwen2.5:3b", systemPrompt: "" };
    case "tool":
      return { toolName: "lookup_topic", inputVariable: "question" };
    case "router":
      return {};
    case "output":
      return {};
  }
}

function labelFor(type: NodeType, config: Record<string, unknown>): string {
  switch (type) {
    case "input":
      return `input: ${config.variableName ?? "question"}`;
    case "prompt": {
      const template = String(config.template ?? "");
      return template.length > 28 ? `${template.slice(0, 28)}…` : template || "prompt";
    }
    case "llm":
      return String(config.model ?? "llm");
    case "tool":
      return String(config.toolName ?? "tool");
    case "router":
      return "router";
    case "output":
      return "output";
  }
}

function edgeColor(kind: EdgeKind): string {
  if (kind === "conditional") return "#6ea8fe";
  if (kind === "default") return "#d8a92c";
  return "#5c6270";
}

function toFlowNode(n: GraphNode): Node<GraphNodeData> {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: { nodeType: n.type, label: labelFor(n.type, n.config), config: n.config, status: "idle" },
  };
}

function toFlowEdge(e: GraphEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.kind === "conditional" ? `if: ${e.condition ?? ""}` : e.kind,
    animated: e.kind === "conditional",
    style: { stroke: edgeColor(e.kind) },
    data: { kind: e.kind, condition: e.condition ?? null },
  };
}

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export default function App() {
  const [graphId] = useState(DEMO_GRAPH_ID);
  const [graphName, setGraphName] = useState("Classify & Route (demo)");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [nodeTraces, setNodeTraces] = useState<Record<string, NodeTrace>>({});
  const closeStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    api.getGraph(DEMO_GRAPH_ID).then((graph) => {
      setGraphName(graph.name);
      setNodes(graph.nodes.map(toFlowNode));
      setEdges(graph.edges.map(toFlowEdge));
    });
  }, [setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge: Edge = {
        id: nextId("e"),
        source: connection.source!,
        target: connection.target!,
        label: "sequence",
        style: { stroke: edgeColor("sequence") },
        data: { kind: "sequence" as EdgeKind, condition: null },
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges],
  );

  const addNode = useCallback(
    (type: NodeType) => {
      const config = defaultConfig(type);
      const id = nextId(type);
      const node: Node<GraphNodeData> = {
        id,
        type,
        position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 400 },
        data: { nodeType: type, label: labelFor(type, config), config, status: "idle" },
      };
      setNodes((nds) => [...nds, node]);
    },
    [setNodes],
  );

  const buildGraphDefinition = useCallback((): GraphDefinition => {
    const entryNode = nodes.find((n) => n.data.nodeType === "input");
    return {
      id: graphId,
      name: graphName,
      entry_node_id: entryNode?.id ?? nodes[0]?.id ?? "",
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        position: { x: n.position.x, y: n.position.y },
        config: n.data.config,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        kind: (e.data?.kind as EdgeKind) ?? "sequence",
        condition: (e.data?.condition as string | null) ?? null,
      })),
    };
  }, [nodes, edges, graphId, graphName]);

  const handleCompile = useCallback(async () => {
    const graph = buildGraphDefinition();
    await api.saveGraph(graph);
    const result = await api.compileGraph(graph.id);
    setDiagnostics(result.diagnostics);
  }, [buildGraphDefinition]);

  const setNodeStatus = useCallback(
    (nodeId: string, status: GraphNodeData["status"]) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status } } : n)));
    },
    [setNodes],
  );

  const handleRun = useCallback(
    async (question: string) => {
      const graph = buildGraphDefinition();
      await api.saveGraph(graph);
      const compileResult = await api.compileGraph(graph.id);
      setDiagnostics(compileResult.diagnostics);
      if (!compileResult.ok) return;

      setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: "idle" } })));
      setEvents([]);
      setNodeTraces({});
      closeStreamRef.current?.();

      const summary = await api.startRun(graph.id, { question });
      setRunSummary(summary);

      const nodeTypeById = new Map(nodes.map((n) => [n.id, n.data.nodeType]));

      closeStreamRef.current = streamRunEvents(summary.run_id, (event) => {
        setEvents((evts) => [...evts, event]);

        if (event.node_id) {
          if (event.event_type === "node.started") {
            setNodeStatus(event.node_id, "running");
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
            setNodeStatus(event.node_id, "succeeded");
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
            setNodeStatus(event.node_id, "failed");
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
          void (async () => {
            const traces = await api.getRunNodeTraces(summary.run_id);
            setNodeTraces(Object.fromEntries(traces.map((t) => [t.node_id, t])));
          })();
          setRunSummary((prev) =>
            prev
              ? {
                  ...prev,
                  status: event.event_type === "run.completed" ? "succeeded" : "failed",
                  result: event.payload.result ?? prev.result,
                }
              : prev,
          );
        }
      });
    },
    [buildGraphDefinition, nodes, setNodes, setNodeStatus],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);
  const selectedTrace = selectedNodeId ? nodeTraces[selectedNodeId] ?? null : null;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <NodePalette onAdd={addNode} />

      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id);
            setSelectedNodeId(null);
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }}
          colorMode="dark"
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodeInspector
          node={{
            id: selectedNode.id,
            type: selectedNode.data.nodeType,
            position: selectedNode.position,
            config: selectedNode.data.config,
          }}
          onConfigChange={(config) =>
            setNodes((nds) =>
              nds.map((n) =>
                n.id === selectedNode.id
                  ? { ...n, data: { ...n.data, config, label: labelFor(n.data.nodeType, config) } }
                  : n,
              ),
            )
          }
          onDelete={() => {
            setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
            setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
            setSelectedNodeId(null);
          }}
        />
      )}

      {selectedEdge && (
        <EdgeInspector
          edge={{
            id: selectedEdge.id,
            source: selectedEdge.source,
            target: selectedEdge.target,
            kind: (selectedEdge.data?.kind as EdgeKind) ?? "sequence",
            condition: (selectedEdge.data?.condition as string | null) ?? null,
          }}
          onChange={(patch) =>
            setEdges((eds) =>
              eds.map((e) => {
                if (e.id !== selectedEdge.id) return e;
                const kind = (patch.kind ?? (e.data?.kind as EdgeKind)) ?? "sequence";
                const condition = patch.condition !== undefined ? patch.condition : (e.data?.condition as string | null);
                return {
                  ...e,
                  data: { ...e.data, kind, condition },
                  label: kind === "conditional" ? `if: ${condition ?? ""}` : kind,
                  style: { stroke: edgeColor(kind) },
                  animated: kind === "conditional",
                };
              }),
            )
          }
          onDelete={() => {
            setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
            setSelectedEdgeId(null);
          }}
        />
      )}

      <RunPanel
        diagnostics={diagnostics}
        onCompile={handleCompile}
        onRun={handleRun}
        runSummary={runSummary}
        events={events}
        selectedTrace={selectedTrace}
      />
    </div>
  );
}
