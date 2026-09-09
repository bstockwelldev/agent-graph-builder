import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, streamRunEvents } from "./api";
import {
  applyCompileIssueToEdge,
  applyCompileIssueToNodeData,
  buildIssueMaps,
  diagnosticsForEdge,
  diagnosticsForNode,
  edgeStrokeForKind,
  validationSummary,
} from "./diagnostics";
import { buildExecutedPath, edgeStrokeForInspection, normalizeRouteDecisions } from "./runInspection";
import { EdgeInspector, NodeInspector } from "./components/NodeInspector";
import { GraphLibrary } from "./components/GraphLibrary";
import { NodePalette } from "./components/NodePalette";
import { RunPanel } from "./components/RunPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FlowCanvas } from "./components/FlowCanvas";
import { ConnectKindMenu } from "./components/ConnectKindMenu";
import { EmptyGraphCoach } from "./components/EmptyGraphCoach";
import { OrientationControl } from "./components/OrientationControl";
import { ShellDrawer, ShellDrawerToggle } from "./components/ShellDrawer";
import { GraphNodeView, type GraphNodeData } from "./components/nodes/GraphNodeView";
import { useShellLayout } from "./hooks/useShellLayout";
import { useUndoStack } from "./hooks/useUndoStack";
import {
  cloneCanvasSnapshot,
  dismissCoach,
  isBlankGraphPattern,
  isCoachDismissed,
  isEditableKeyboardTarget,
} from "./lib/graphAuthoring";
import { color, shell, spacing, surface, text, typeScale } from "./theme";
import { Button } from "./components/ui/Button";
import { TextInput } from "./components/ui/fields";
import type { Diagnostic, EdgeKind, GraphDefinition, GraphEdge, GraphNode, GraphOrientation, NodeTrace, NodeType, PlatformEvent, RouteDecision, RunSummary, ChatProvider } from "./types";

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

function toFlowNode(n: GraphNode): Node<GraphNodeData> {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: { nodeType: n.type, label: labelFor(n.type, n.config), config: n.config, status: "idle", compileIssue: null },
  };
}

function toFlowEdge(e: GraphEdge, issue?: { severity: "error" | "warning"; caption: string }): Edge {
  const { stroke, strokeWidth } = edgeStrokeForKind(e.kind, issue);
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.kind === "conditional" ? `if: ${e.condition ?? ""}` : e.kind,
    animated: e.kind === "conditional",
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
    label: kind === "conditional" ? `if: ${condition ?? ""}` : kind,
    animated: kind === "conditional",
    style: { stroke, strokeWidth },
    data: { kind, condition },
  };
}

function fingerprintGraph(graph: GraphDefinition): string {
  return JSON.stringify({
    id: graph.id,
    name: graph.name,
    entry_node_id: graph.entry_node_id,
    orientation: graph.orientation ?? "auto",
    nodes: graph.nodes,
    edges: graph.edges,
  });
}

function syncIdCounter(graph: GraphDefinition) {
  let max = idCounter;
  for (const item of [...graph.nodes, ...graph.edges]) {
    const match = item.id.match(/_(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  idCounter = max;
}

function applyGraphToCanvas(
  graph: GraphDefinition,
  setters: {
    setGraphId: (id: string) => void;
    setGraphName: (name: string) => void;
    setGraphOrientation: (orientation: GraphOrientation) => void;
    setNodes: ReturnType<typeof useNodesState<Node<GraphNodeData>>>[1];
    setEdges: ReturnType<typeof useEdgesState<Edge>>[1];
    setSelectedNodeId: (id: string | null) => void;
    setSelectedEdgeId: (id: string | null) => void;
    setDiagnostics: (d: Diagnostic[]) => void;
    setRunSummary: (r: RunSummary | null) => void;
    setEvents: (e: PlatformEvent[]) => void;
    setNodeTraces: (t: Record<string, NodeTrace>) => void;
    closeStream: () => void;
  },
) {
  syncIdCounter(graph);
  setters.setGraphId(graph.id);
  setters.setGraphName(graph.name);
  setters.setGraphOrientation(graph.orientation ?? "auto");
  setters.setNodes(graph.nodes.map(toFlowNode));
  setters.setEdges(graph.edges.map((edge) => toFlowEdge(edge)));
  setters.setSelectedNodeId(null);
  setters.setSelectedEdgeId(null);
  setters.setDiagnostics([]);
  setters.setRunSummary(null);
  setters.setEvents([]);
  setters.setNodeTraces({});
  setters.closeStream();
}

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

const headerBarStyle = {
  padding: `${spacing[2]}px ${spacing[3]}px`,
  borderBottom: `1px solid ${surface.border}`,
  background: surface.panel,
  color: text.primary,
} as const;

export default function App() {
  const [graphId, setGraphId] = useState<string | null>(null);
  const [graphName, setGraphName] = useState("");
  const [graphs, setGraphs] = useState<GraphDefinition[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [runHistory, setRunHistory] = useState<RunSummary[]>([]);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [nodeTraces, setNodeTraces] = useState<Record<string, NodeTrace>>({});
  const [inspectionRunId, setInspectionRunId] = useState<string | null>(null);
  const [inspectionRouteDecisions, setInspectionRouteDecisions] = useState<RouteDecision[]>([]);
  const [savedGraphFingerprint, setSavedGraphFingerprint] = useState<string>("");
  const [graphOrientation, setGraphOrientation] = useState<GraphOrientation>("auto");
  const [layoutLiveAnnouncement, setLayoutLiveAnnouncement] = useState("");
  const [dirtyLiveAnnouncement, setDirtyLiveAnnouncement] = useState("");
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{
    connection: Connection;
    x: number;
    y: number;
    targetLabel: string;
  } | null>(null);
  const [providerBlockMessage, setProviderBlockMessage] = useState<string | null>(null);
  const [graphLoadFailed, setGraphLoadFailed] = useState(false);
  const shiftConnectRef = useRef(false);
  const connectPointerRef = useRef({ x: 0, y: 0 });
  const closeStreamRef = useRef<(() => void) | null>(null);
  const diagnosticsSectionRef = useRef<HTMLDivElement>(null);
  const { pushSnapshot, undo, redo, clearHistory } = useUndoStack();
  const validationLabel = useMemo(() => validationSummary(diagnostics).label, [diagnostics]);
  const {
    isCompact,
    authoringEnabled,
    openDrawer,
    setOpenDrawer,
    toggleDrawer,
    closeDrawer,
    reducedMotion,
  } = useShellLayout();

  useEffect(() => {
    if (isCompact && (selectedNodeId || selectedEdgeId)) {
      setOpenDrawer("inspector");
    }
  }, [isCompact, selectedNodeId, selectedEdgeId, setOpenDrawer]);

  useEffect(() => {
    setCoachDismissed(graphId ? isCoachDismissed(graphId) : false);
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

  const focusDiagnostics = useCallback(() => {
    diagnosticsSectionRef.current?.focus();
    diagnosticsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const handleDiagnosticClick = useCallback((diagnostic: Diagnostic) => {
    if (diagnostic.edge_id) {
      setSelectedEdgeId(diagnostic.edge_id);
      setSelectedNodeId(null);
      return;
    }
    if (diagnostic.node_id) {
      setSelectedNodeId(diagnostic.node_id);
      setSelectedEdgeId(null);
    }
  }, []);

  const applyDiagnosticsToCanvas = useCallback(
    (nextDiagnostics: Diagnostic[]) => {
      const { nodeIssues, edgeIssues } = buildIssueMaps(nextDiagnostics);
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: applyCompileIssueToNodeData(node.data, nodeIssues.get(node.id)),
        })),
      );
      setEdges((eds) => eds.map((edge) => applyCompileIssueToEdge(edge, edgeIssues.get(edge.id))));
    },
    [setNodes, setEdges],
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

      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...applyCompileIssueToNodeData(node.data, nodeIssues.get(node.id)),
            status: traces[node.id]?.status ?? "idle",
            inspectionDimmed: path.dimNodeIds.has(node.id),
          },
        })),
      );

      setEdges((eds) =>
        eds.map((edge) => {
          const kind = (edge.data?.kind as EdgeKind) ?? "sequence";
          const { stroke, strokeWidth, opacity } = edgeStrokeForInspection(edge, path, kind);
          return {
            ...edge,
            style: { stroke, strokeWidth, opacity },
            animated: kind === "conditional" && path.highlightEdgeIds.has(edge.id),
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
        data: { ...node.data, status: "idle", inspectionDimmed: false },
      })),
    );
    applyDiagnosticsToCanvas(diagnostics);
  }, [applyDiagnosticsToCanvas, diagnostics, setNodes]);

  useEffect(() => {
    if (!inspectionRunId) return;
    paintInspectionPath(nodeTraces, inspectionRouteDecisions);
  }, [inspectionRunId, inspectionRouteDecisions, nodeTraces, paintInspectionPath]);

  const closeStream = useCallback(() => {
    closeStreamRef.current?.();
    closeStreamRef.current = null;
  }, []);

  useEffect(() => {
    if (inspectionRunId) return;
    applyDiagnosticsToCanvas(diagnostics);
  }, [diagnostics, applyDiagnosticsToCanvas, inspectionRunId]);

  const canvasSetters = useCallback(
    () => ({
      setGraphId,
      setGraphName,
      setGraphOrientation,
      setNodes,
      setEdges,
      setSelectedNodeId,
      setSelectedEdgeId,
      setDiagnostics,
      setRunSummary,
      setEvents,
      setNodeTraces,
      closeStream,
    }),
    [setNodes, setEdges, closeStream],
  );

  const refreshGraphList = useCallback(async () => {
    const list = await api.listGraphs();
    setGraphs(list);
    return list;
  }, []);

  const refreshRunHistory = useCallback(async (targetGraphId: string) => {
    const runs = await api.listRuns(targetGraphId);
    setRunHistory(runs);
    return runs;
  }, []);

  useEffect(() => {
    if (!graphId) {
      setRunHistory([]);
      return;
    }
    refreshRunHistory(graphId).catch((err: unknown) => {
      console.error("Failed to load run history:", err);
    });
  }, [graphId, refreshRunHistory]);

  const applyRunInspection = useCallback(
    (summary: RunSummary, traces: NodeTrace[]) => {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
      setEvents([]);
      setRunSummary(summary);
      setInspectionRunId(summary.run_id);
      const routeDecisions = normalizeRouteDecisions(summary.route_decisions ?? []);
      setInspectionRouteDecisions(routeDecisions);
      const byId = Object.fromEntries(traces.map((trace) => [trace.node_id, trace]));
      setNodeTraces(byId);
    },
    [],
  );

  const handleSelectHistoricalRun = useCallback(
    async (runId: string) => {
      const [summary, traces] = await Promise.all([api.getRun(runId), api.getRunNodeTraces(runId)]);
      applyRunInspection(summary, traces);
    },
    [applyRunInspection],
  );

  const markGraphLoadResult = useCallback((graph: GraphDefinition) => {
    if (graph.nodes.length === 0) {
      if (import.meta.env.DEV) {
        console.warn("Graph loaded with no nodes:", graph.id);
      }
      setGraphLoadFailed(true);
    } else {
      setGraphLoadFailed(false);
    }
  }, []);

  const loadGraphById = useCallback(
    async (targetId: string) => {
      const graph = await api.getGraph(targetId);
      applyGraphToCanvas(graph, canvasSetters());
      markGraphLoadResult(graph);
      clearHistory();
      setInspectionRunId(null);
      setInspectionRouteDecisions([]);
      setSavedGraphFingerprint(fingerprintGraph(graph));
    },
    [canvasSetters, clearHistory, markGraphLoadResult],
  );

  const handleRetryGraphLoad = useCallback(async () => {
    if (!graphId) return;
    setGraphLoadFailed(false);
    try {
      await loadGraphById(graphId);
    } catch (err: unknown) {
      console.error("Failed to reload graph:", err);
      setGraphLoadFailed(true);
    }
  }, [graphId, loadGraphById]);

  useEffect(() => {
    refreshGraphList()
      .then((list) => {
        const preferred = list.find((g) => g.id === DEMO_GRAPH_ID) ?? list[0];
        if (preferred) {
          applyGraphToCanvas(preferred, {
            setGraphId,
            setGraphName,
            setGraphOrientation,
            setNodes,
            setEdges,
            setSelectedNodeId,
            setSelectedEdgeId,
            setDiagnostics,
            setRunSummary,
            setEvents,
            setNodeTraces,
            closeStream: () => closeStreamRef.current?.(),
          });
          markGraphLoadResult(preferred);
          setSavedGraphFingerprint(fingerprintGraph(preferred));
          clearHistory();
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load graphs:", err);
      });
  }, [refreshGraphList, setNodes, setEdges, clearHistory, markGraphLoadResult]);

  const handleCreateGraph = useCallback(
    async (name: string, template: "blank" | "demo") => {
      const graph = await api.createGraph(name, template);
      await refreshGraphList();
      applyGraphToCanvas(graph, canvasSetters());
      markGraphLoadResult(graph);
      clearHistory();
      setInspectionRunId(null);
      setInspectionRouteDecisions([]);
      setSavedGraphFingerprint(fingerprintGraph(graph));
    },
    [refreshGraphList, canvasSetters, clearHistory, markGraphLoadResult],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      const needsKindMenu = sourceNode?.data.nodeType === "router" || shiftConnectRef.current;

      if (needsKindMenu) {
        setPendingConnection({
          connection,
          x: connectPointerRef.current.x,
          y: connectPointerRef.current.y,
          targetLabel: targetNode?.data.label ?? connection.target ?? "target",
        });
        return;
      }

      pushSnapshot(cloneCanvasSnapshot(nodes, edges, graphName, graphOrientation));
      setEdges((current) => addEdge(createFlowEdge(connection, "sequence", null), current));
    },
    [nodes, edges, graphName, graphOrientation, pushSnapshot, setEdges],
  );

  const confirmPendingConnection = useCallback(
    (kind: EdgeKind, condition: string | null) => {
      if (!pendingConnection) return;
      pushSnapshot(cloneCanvasSnapshot(nodes, edges, graphName, graphOrientation));
      setEdges((current) => addEdge(createFlowEdge(pendingConnection.connection, kind, condition), current));
      setPendingConnection(null);
    },
    [pendingConnection, nodes, edges, graphName, graphOrientation, pushSnapshot, setEdges],
  );

  const getCanvasSnapshot = useCallback(
    () => cloneCanvasSnapshot(nodes, edges, graphName, graphOrientation),
    [nodes, edges, graphName, graphOrientation],
  );

  const applyCanvasSnapshot = useCallback(
    (snapshot: ReturnType<typeof getCanvasSnapshot>) => {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setGraphName(snapshot.graphName);
      setGraphOrientation(snapshot.graphOrientation);
    },
    [setNodes, setEdges],
  );

  const recordMutation = useCallback(() => {
    pushSnapshot(getCanvasSnapshot());
  }, [getCanvasSnapshot, pushSnapshot]);

  const patchEdgeById = useCallback(
    (edgeId: string, patch: Partial<GraphEdge>) => {
      recordMutation();
      setEdges((current) =>
        current.map((edge) => {
          if (edge.id !== edgeId) return edge;
          const kind = (patch.kind ?? (edge.data?.kind as EdgeKind)) ?? "sequence";
          const condition = patch.condition !== undefined ? patch.condition : (edge.data?.condition as string | null);
          const issue = buildIssueMaps(diagnostics).edgeIssues.get(edge.id);
          const { stroke, strokeWidth } = edgeStrokeForKind(kind, issue);
          return {
            ...edge,
            data: { ...edge.data, kind, condition },
            label: kind === "conditional" ? `if: ${condition ?? ""}` : kind,
            style: { stroke, strokeWidth },
            animated: kind === "conditional",
          };
        }),
      );
    },
    [diagnostics, recordMutation, setEdges],
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
    (type: NodeType) => {
      recordMutation();
      const config = defaultConfig(type);
      const id = nextId(type);
      const node: Node<GraphNodeData> = {
        id,
        type,
        position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 400 },
        data: { nodeType: type, label: labelFor(type, config), config, status: "idle", compileIssue: null },
      };
      setNodes((current) => [...current, node]);
    },
    [recordMutation, setNodes],
  );

  const buildGraphDefinition = useCallback((): GraphDefinition => {
    if (!graphId) {
      throw new Error("No graph loaded");
    }
    const entryNode = nodes.find((n) => n.data.nodeType === "input");
    return {
      id: graphId,
      name: graphName,
      entry_node_id: entryNode?.id ?? nodes[0]?.id ?? "",
      orientation: graphOrientation,
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
  }, [nodes, edges, graphId, graphName, graphOrientation]);

  const canvasDirty = useMemo(() => {
    if (!graphId) return false;
    try {
      return fingerprintGraph(buildGraphDefinition()) !== savedGraphFingerprint;
    } catch {
      return false;
    }
  }, [buildGraphDefinition, graphId, savedGraphFingerprint]);

  const isCanvasDirty = useCallback(() => canvasDirty, [canvasDirty]);

  const handleSave = useCallback(async () => {
    if (!graphId || !canvasDirty) return;
    const graph = buildGraphDefinition();
    await api.saveGraph(graph);
    setSavedGraphFingerprint(fingerprintGraph(graph));
    await refreshGraphList();
  }, [buildGraphDefinition, canvasDirty, graphId, refreshGraphList]);

  useEffect(() => {
    setDirtyLiveAnnouncement(canvasDirty ? "Unsaved graph changes" : "");
  }, [canvasDirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
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
  }, [
    applyCanvasSnapshot,
    deleteSelection,
    getCanvasSnapshot,
    redo,
    selectedEdgeId,
    selectedNodeId,
    undo,
  ]);

  const handleRootReload = useCallback(() => {
    if (isCanvasDirty()) {
      const confirmed = window.confirm("You have unsaved canvas changes. Reload the app anyway?");
      if (!confirmed) return;
    }
    window.location.reload();
  }, [isCanvasDirty]);

  const handleSelectGraph = useCallback(
    async (targetId: string) => {
      if (targetId === graphId) return;
      if (isCanvasDirty()) {
        const confirmed = window.confirm("You have unsaved canvas changes. Switch graphs anyway?");
        if (!confirmed) return;
      }
      await loadGraphById(targetId);
    },
    [graphId, isCanvasDirty, loadGraphById],
  );

  const handleExportGraph = useCallback(() => {
    try {
      const graph = buildGraphDefinition();
      const blob = new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${graph.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("Export failed:", err);
    }
  }, [buildGraphDefinition]);

  const handleImportGraph = useCallback(
    async (file: File) => {
      const graph = JSON.parse(await file.text()) as GraphDefinition;
      await api.saveGraph(graph);
      await refreshGraphList();
      await loadGraphById(graph.id);
    },
    [loadGraphById, refreshGraphList],
  );

  useEffect(() => {
    if (!graphId || nodes.length === 0) return;
    const timer = window.setTimeout(() => {
      try {
        const graph = buildGraphDefinition();
        api
          .validateGraph(graph)
          .then((result) => setDiagnostics(result.diagnostics))
          .catch((err: unknown) => {
            console.error("Live validation failed:", err);
          });
      } catch {
        // Graph not ready yet.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [buildGraphDefinition, graphId, nodes, edges, graphName]);

  const handleCompile = useCallback(async () => {
    if (!graphId) return;
    const graph = buildGraphDefinition();
    await api.saveGraph(graph);
    setSavedGraphFingerprint(fingerprintGraph(graph));
    const result = await api.compileGraph(graph.id);
    setDiagnostics(result.diagnostics);
    if (!result.ok) {
      focusDiagnostics();
    }
    await refreshGraphList();
  }, [buildGraphDefinition, graphId, focusDiagnostics, refreshGraphList]);

  const handleRun = useCallback(
    async (question: string, provider: ChatProvider, model?: string, apiKey?: string) => {
      if (!graphId) return;
      setProviderBlockMessage(null);

      const needsServerKey = provider === "groq" || provider === "google" || provider === "azure";
      if (needsServerKey && !apiKey?.trim()) {
        const readiness = await api.providerReady(provider);
        if (!readiness.ready) {
          setProviderBlockMessage(readiness.message);
          return;
        }
      }

      const graph = buildGraphDefinition();
      await api.saveGraph(graph);
      setSavedGraphFingerprint(fingerprintGraph(graph));
      const compileResult = await api.compileGraph(graph.id);
      setDiagnostics(compileResult.diagnostics);
      if (!compileResult.ok) {
        focusDiagnostics();
        return;
      }

      setEvents([]);
      setNodeTraces({});
      setInspectionRouteDecisions([]);
      closeStreamRef.current?.();

      const summary = await api.startRun(graph.id, { question }, provider, model, apiKey);
      setRunSummary(summary);
      setInspectionRunId(summary.run_id);

      const nodeTypeById = new Map(nodes.map((n) => [n.id, n.data.nodeType]));

      closeStreamRef.current = streamRunEvents(summary.run_id, (event) => {
        setEvents((evts) => [...evts, event]);

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
          void (async () => {
            const traces = await api.getRunNodeTraces(summary.run_id);
            setNodeTraces(Object.fromEntries(traces.map((trace) => [trace.node_id, trace])));
            const latest = await api.getRun(summary.run_id);
            setRunSummary(latest);
            setInspectionRouteDecisions(normalizeRouteDecisions(latest.route_decisions ?? []));
            if (graphId) {
              await refreshRunHistory(graphId);
            }
          })();
        }
      });
    },
    [buildGraphDefinition, graphId, focusDiagnostics, nodes, refreshRunHistory],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);
  const selectedTrace = selectedNodeId ? nodeTraces[selectedNodeId] ?? null : null;
  const routerOutgoingEdges: GraphEdge[] =
    selectedNode?.data.nodeType === "router"
      ? edges
          .filter((edge) => edge.source === selectedNode.id)
          .map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            kind: (edge.data?.kind as EdgeKind) ?? "sequence",
            condition: (edge.data?.condition as string | null) ?? null,
          }))
      : [];
  const showEmptyCoach =
    authoringEnabled && !coachDismissed && graphId !== null && isBlankGraphPattern(nodes, edges);
  const headerLiveAnnouncement = [dirtyLiveAnnouncement, layoutLiveAnnouncement].filter(Boolean).join(". ");

  const libraryPanel = (
    <>
      <GraphLibrary
        graphs={graphs}
        activeGraphId={graphId}
        onSelect={(id) => void handleSelectGraph(id)}
        onCreate={handleCreateGraph}
        onExport={handleExportGraph}
        onImport={(file) => handleImportGraph(file)}
      />
      <NodePalette onAdd={addNode} authoringEnabled={authoringEnabled} />
    </>
  );

  const inspectorPanel = selectedNode ? (
    <NodeInspector
      fullWidth={isCompact}
      node={{
        id: selectedNode.id,
        type: selectedNode.data.nodeType,
        position: selectedNode.position,
        config: selectedNode.data.config,
      }}
      issues={diagnosticsForNode(diagnostics, selectedNode.id)}
      outgoingEdges={routerOutgoingEdges}
      onConfigChange={(config) => {
        recordMutation();
        setNodes((nds) =>
          nds.map((n) =>
            n.id === selectedNode.id
              ? { ...n, data: { ...n.data, config, label: labelFor(n.data.nodeType, config) } }
              : n,
          ),
        );
      }}
      onEdgeChange={patchEdgeById}
      onDelete={() => {
        deleteSelection();
      }}
    />
  ) : selectedEdge ? (
    <EdgeInspector
      fullWidth={isCompact}
      edge={{
        id: selectedEdge.id,
        source: selectedEdge.source,
        target: selectedEdge.target,
        kind: (selectedEdge.data?.kind as EdgeKind) ?? "sequence",
        condition: (selectedEdge.data?.condition as string | null) ?? null,
      }}
      issues={diagnosticsForEdge(diagnostics, selectedEdge.id)}
      onChange={(patch) => patchEdgeById(selectedEdge.id, patch)}
      onDelete={() => {
        deleteSelection();
      }}
    />
  ) : (
    <div style={{ padding: spacing[3], ...typeScale.caption, opacity: 0.75 }}>
      Select a node or edge on the canvas to inspect it.
    </div>
  );

  const runPanel = (
    <RunPanel
      layout={isCompact ? "drawer" : "rail"}
      graphId={graphId}
      diagnostics={diagnostics}
      diagnosticsSectionRef={diagnosticsSectionRef}
      providerBlockMessage={providerBlockMessage}
      inspectionRunId={inspectionRunId}
      onExitInspection={exitInspection}
      onCompile={handleCompile}
      onRun={handleRun}
      onDiagnosticClick={handleDiagnosticClick}
      runSummary={runSummary}
      runHistory={runHistory}
      onSelectRun={(runId) => void handleSelectHistoricalRun(runId)}
      events={events}
      selectedTrace={selectedTrace}
    />
  );

  return (
    <ErrorBoundary regionLabel="Application" onReload={handleRootReload} fallbackHeight="100vh">
      <div
        style={{
          display: "flex",
          flexDirection: isCompact ? "column" : "row",
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
        }}
      >
        {!isCompact && (
          <aside
            style={{
              width: shell.rail.library,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              borderRight: `1px solid ${surface.border}`,
              background: surface.panel,
              overflowY: "auto",
              minHeight: 0,
            }}
          >
            <ErrorBoundary regionLabel="Graph library">{libraryPanel}</ErrorBoundary>
          </aside>
        )}

        <main style={{ flex: "1 1 0", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          {isCompact && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: spacing[2],
                padding: `${spacing[2]}px ${spacing[3]}px`,
                borderBottom: `1px solid ${surface.border}`,
                background: surface.panel,
              }}
            >
              <ShellDrawerToggle
                label="Library"
                active={openDrawer === "library"}
                controlsId="shell-drawer-library"
                onClick={() => toggleDrawer("library")}
              />
              <ShellDrawerToggle
                label="Inspector"
                active={openDrawer === "inspector"}
                controlsId="shell-drawer-inspector"
                onClick={() => toggleDrawer("inspector")}
              />
              <ShellDrawerToggle
                label="Run"
                active={openDrawer === "run"}
                controlsId="shell-drawer-run"
                onClick={() => toggleDrawer("run")}
              />
            </div>
          )}

          <div style={headerBarStyle}>
            <TextInput
              value={graphName}
              onChange={(e) => setGraphName(e.target.value)}
              aria-label="Graph name"
              style={{ ...typeScale.subheading, fontWeight: 600, marginBottom: spacing[1] }}
            />
            <div style={{ ...typeScale.caption, opacity: 0.6 }}>{graphId ?? "No graph selected"}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: spacing[2], marginTop: spacing[1], alignItems: "center" }}>
              <Button
                variant="primary"
                disabled={!graphId || !canvasDirty}
                onClick={() => void handleSave()}
                title="Save graph without compiling"
                style={{ minHeight: shell.touchTarget.min }}
              >
                Save
              </Button>
              {canvasDirty && (
                <span
                  aria-live="polite"
                  style={{
                    ...typeScale.caption,
                    padding: `${spacing[1]}px ${spacing[2]}px`,
                    borderRadius: 999,
                    border: `1px solid ${color.warning[700]}`,
                    background: surface.raised,
                    color: color.warning[500],
                    fontWeight: 600,
                  }}
                >
                  Unsaved
                </span>
              )}
              {inspectionRunId && runSummary && (
                <div
                  style={{
                    ...typeScale.caption,
                    padding: `${spacing[1]}px ${spacing[2]}px`,
                    borderRadius: 999,
                    border: `1px solid ${color.primary[700]}`,
                    background: color.neutral[900],
                    color: color.primary[500],
                  }}
                >
                  Inspecting run · <b>{runSummary.status}</b>
                  {runSummary.started_at ? ` · ${new Date(runSummary.started_at).toLocaleString()}` : ""}
                </div>
              )}
              <button
                type="button"
                onClick={focusDiagnostics}
                title="Open graph validation diagnostics"
                aria-live="polite"
                style={{
                  ...typeScale.caption,
                  minHeight: shell.touchTarget.min,
                  padding: `${spacing[1]}px ${spacing[2]}px`,
                  borderRadius: 999,
                  border: `1px solid ${surface.borderStrong}`,
                  background: surface.raised,
                  color: validationLabel === "Ready" ? color.success[500] : color.warning[500],
                  cursor: "pointer",
                }}
              >
                Validation: {validationLabel}
              </button>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "nowrap",
                gap: spacing[2],
                marginTop: spacing[2],
                alignItems: "center",
              }}
            >
              <OrientationControl
                value={graphOrientation}
                onChange={(value) => {
                  recordMutation();
                  setGraphOrientation(value);
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, position: "relative", minHeight: 0, minWidth: 0 }}>
            <ErrorBoundary regionLabel="Canvas" fallbackHeight="100%">
              <FlowCanvas
                graphId={graphId}
                nodes={nodes}
                edges={edges}
                setNodes={setNodes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={authoringEnabled ? onConnect : undefined}
                onConnectStart={(event) => {
                  if (event instanceof MouseEvent) {
                    connectPointerRef.current = { x: event.clientX, y: event.clientY };
                  } else if (event instanceof TouchEvent && event.touches[0]) {
                    connectPointerRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
                  }
                }}
                authoringEnabled={authoringEnabled}
                nodeTypes={nodeTypes}
                reducedMotion={reducedMotion}
                graphOrientation={graphOrientation}
                liveAnnouncement={headerLiveAnnouncement}
                onLiveAnnouncement={(message) => {
                  if (message.startsWith("Graph layout:")) {
                    setLayoutLiveAnnouncement(message);
                  } else {
                    setDirtyLiveAnnouncement(message);
                  }
                }}
                onClearLiveAnnouncement={() => {
                  setLayoutLiveAnnouncement("");
                  setDirtyLiveAnnouncement("");
                }}
                loadFailureVisible={graphLoadFailed && graphId !== null && nodes.length === 0}
                onRetryLoad={() => void handleRetryGraphLoad()}
                overlay={
                  <EmptyGraphCoach
                    visible={showEmptyCoach}
                    onDismiss={() => {
                      if (graphId) dismissCoach(graphId);
                      setCoachDismissed(true);
                    }}
                  />
                }
                onNodeClick={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setSelectedEdgeId(null);
                  if (isCompact) setOpenDrawer("inspector");
                }}
                onEdgeClick={(edgeId) => {
                  setSelectedEdgeId(edgeId);
                  setSelectedNodeId(null);
                  if (isCompact) setOpenDrawer("inspector");
                }}
                onPaneClick={() => {
                  setPendingConnection(null);
                  if (isCompact) closeDrawer();
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
              />
            </ErrorBoundary>
          </div>
        </main>

        {!isCompact && (selectedNode || selectedEdge) && (
          <aside
            style={{
              width: shell.rail.inspector,
              flexShrink: 0,
              minHeight: 0,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              borderLeft: `1px solid ${surface.border}`,
              background: surface.panel,
              overflow: "hidden",
            }}
          >
            <ErrorBoundary regionLabel={selectedNode ? "Node inspector" : "Edge inspector"} fallbackHeight="100%">
              {inspectorPanel}
            </ErrorBoundary>
          </aside>
        )}

        {!isCompact && (
          <aside
            style={{
              width: shell.rail.run,
              flexShrink: 0,
              minHeight: 0,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <ErrorBoundary regionLabel="Run panel" onReset={closeStream} fallbackHeight="100%">
              {runPanel}
            </ErrorBoundary>
          </aside>
        )}

        {isCompact && (
          <>
            <ShellDrawer
              open={openDrawer === "library"}
              onClose={closeDrawer}
              side="left"
              title="Graph library"
              drawerId="shell-drawer-library"
              reducedMotion={reducedMotion}
            >
              <ErrorBoundary regionLabel="Graph library">{libraryPanel}</ErrorBoundary>
            </ShellDrawer>
            <ShellDrawer
              open={openDrawer === "inspector"}
              onClose={closeDrawer}
              side="right"
              title="Inspector"
              drawerId="shell-drawer-inspector"
              reducedMotion={reducedMotion}
            >
              <ErrorBoundary regionLabel="Inspector">{inspectorPanel}</ErrorBoundary>
            </ShellDrawer>
            <ShellDrawer
              open={openDrawer === "run"}
              onClose={closeDrawer}
              side="right"
              title="Run"
              drawerId="shell-drawer-run"
              reducedMotion={reducedMotion}
            >
              <ErrorBoundary regionLabel="Run panel" onReset={closeStream}>
                {runPanel}
              </ErrorBoundary>
            </ShellDrawer>
          </>
        )}
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
    </ErrorBoundary>
  );
}
